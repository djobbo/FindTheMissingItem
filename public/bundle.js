var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let stylesheet;
    let active = 0;
    let current_rules = {};
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        if (!current_rules[name]) {
            if (!stylesheet) {
                const style = element('style');
                document.head.appendChild(style);
                stylesheet = style.sheet;
            }
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        node.style.animation = (node.style.animation || '')
            .split(', ')
            .filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        )
            .join(', ');
        if (name && !--active)
            clear_rules();
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            current_rules = {};
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }

    const globals = (typeof window !== 'undefined' ? window : global);
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.18.2' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    /* App.svelte generated by Svelte v3.18.2 */

    const { Error: Error$, window: window$ } = globals;
    const file$ = "App.svelte";

    // (195:2) {:else}
    function create_else_block$(ctx) {
    	let h2$;
    	let t1$;
    	let button$;
    	let dispose;

    	const block$ = {
    		c: function create() {
    			h2$ = element("h2");
    			h2$.textContent = "Click below to start the game";
    			t1$ = space();
    			button$ = element("button");
    			button$.textContent = "Laisser bouss se cacher";
    			attr_dev(h2$, "class", "svelte-1iyp657");
    			add_location(h2$, file$, 195, 4, 4512);
    			add_location(button$, file$, 196, 4, 4556);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2$, anchor);
    			insert_dev(target, t1$, anchor);
    			insert_dev(target, button$, anchor);
    			dispose = listen_dev(button$, "click", /*startGame*/ ctx[8], false, false, false);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2$);
    			if (detaching) detach_dev(t1$);
    			if (detaching) detach_dev(button$);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block$,
    		id: create_else_block$.name,
    		type: "else",
    		source: "(195:2) {:else}",
    		ctx
    	});

    	return block$;
    }

    // (177:2) {#if gameStarted}
    function create_if_block$(ctx) {
    	let h2$;

    	let t0$_value$ = (/*itemHidden*/ ctx[4]
    	? `Trouve le bouss caché sur cette page!`
    	: `Bravo!`) + "";

    	let t0$;
    	let t1$;
    	let h3$;
    	let t2$;
    	let t3$;
    	let t4$;
    	let if_block$_anchor$;
    	let current;
    	let if_block$ = !/*itemHidden*/ ctx[4] && create_if_block$_1(ctx);

    	const block$ = {
    		c: function create() {
    			h2$ = element("h2");
    			t0$ = text(t0$_value$);
    			t1$ = space();
    			h3$ = element("h3");
    			t2$ = text("Score: ");
    			t3$ = text(/*score*/ ctx[6]);
    			t4$ = space();
    			if (if_block$) if_block$.c();
    			if_block$_anchor$ = empty();
    			attr_dev(h2$, "class", "svelte-1iyp657");
    			add_location(h2$, file$, 177, 4, 3881);
    			attr_dev(h3$, "class", "svelte-1iyp657");
    			add_location(h3$, file$, 178, 4, 3961);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2$, anchor);
    			append_dev(h2$, t0$);
    			insert_dev(target, t1$, anchor);
    			insert_dev(target, h3$, anchor);
    			append_dev(h3$, t2$);
    			append_dev(h3$, t3$);
    			insert_dev(target, t4$, anchor);
    			if (if_block$) if_block$.m(target, anchor);
    			insert_dev(target, if_block$_anchor$, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if ((!current || dirty & /*itemHidden*/ 16) && t0$_value$ !== (t0$_value$ = (/*itemHidden*/ ctx[4]
    			? `Trouve le bouss caché sur cette page!`
    			: `Bravo!`) + "")) set_data_dev(t0$, t0$_value$);

    			if (!current || dirty & /*score*/ 64) set_data_dev(t3$, /*score*/ ctx[6]);

    			if (!/*itemHidden*/ ctx[4]) {
    				if (if_block$) {
    					if_block$.p(ctx, dirty);
    					transition_in(if_block$, 1);
    				} else {
    					if_block$ = create_if_block$_1(ctx);
    					if_block$.c();
    					transition_in(if_block$, 1);
    					if_block$.m(if_block$_anchor$.parentNode, if_block$_anchor$);
    				}
    			} else if (if_block$) {
    				group_outros();

    				transition_out(if_block$, 1, 1, () => {
    					if_block$ = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block$);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block$);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2$);
    			if (detaching) detach_dev(t1$);
    			if (detaching) detach_dev(h3$);
    			if (detaching) detach_dev(t4$);
    			if (if_block$) if_block$.d(detaching);
    			if (detaching) detach_dev(if_block$_anchor$);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block$,
    		id: create_if_block$.name,
    		type: "if",
    		source: "(177:2) {#if gameStarted}",
    		ctx
    	});

    	return block$;
    }

    // (180:4) {#if !itemHidden}
    function create_if_block$_1(ctx) {
    	let button$;
    	let t1$;
    	let div$;
    	let img$;
    	let img$_src_value$;
    	let div$_intro$;
    	let div$_outro$;
    	let current;
    	let dispose;

    	const block$ = {
    		c: function create() {
    			button$ = element("button");
    			button$.textContent = "Laisser bouss se cacher";
    			t1$ = space();
    			div$ = element("div");
    			img$ = element("img");
    			add_location(button$, file$, 180, 6, 4015);
    			if (img$.src !== (img$_src_value$ = "https://cdn.discordapp.com/attachments/638869924265328641/675004347641233418/unknown.png")) attr_dev(img$, "src", img$_src_value$);
    			attr_dev(img$, "width", "100%");
    			attr_dev(img$, "height", "100%");
    			attr_dev(img$, "alt", "item");
    			add_location(img$, file$, 187, 8, 4286);
    			attr_dev(div$, "class", "item svelte-1iyp657");
    			set_style(div$, "top", /*itemPos*/ ctx[3][1] - 32 + "px");
    			set_style(div$, "left", /*itemPos*/ ctx[3][0] - 32 + "px");
    			toggle_class(div$, "itemHidden", /*itemHidden*/ ctx[4]);
    			add_location(div$, file$, 181, 6, 4091);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button$, anchor);
    			insert_dev(target, t1$, anchor);
    			insert_dev(target, div$, anchor);
    			append_dev(div$, img$);
    			current = true;
    			dispose = listen_dev(button$, "click", /*randomizeItemPos*/ ctx[9], false, false, false);
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*itemPos*/ 8) {
    				set_style(div$, "top", /*itemPos*/ ctx[3][1] - 32 + "px");
    			}

    			if (!current || dirty & /*itemPos*/ 8) {
    				set_style(div$, "left", /*itemPos*/ ctx[3][0] - 32 + "px");
    			}

    			if (dirty & /*itemHidden*/ 16) {
    				toggle_class(div$, "itemHidden", /*itemHidden*/ ctx[4]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div$_outro$) div$_outro$.end(1);
    				if (!div$_intro$) div$_intro$ = create_in_transition(div$, fade, {});
    				div$_intro$.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (div$_intro$) div$_intro$.invalidate();
    			div$_outro$ = create_out_transition(div$, fly, { y: -200, duration: 250 });
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button$);
    			if (detaching) detach_dev(t1$);
    			if (detaching) detach_dev(div$);
    			if (detaching && div$_outro$) div$_outro$.end();
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block$,
    		id: create_if_block$_1.name,
    		type: "if",
    		source: "(180:4) {#if !itemHidden}",
    		ctx
    	});

    	return block$;
    }

    function create_fragment(ctx) {
    	let main$;
    	let h1$;

    	let t0$_value$ = (/*itemHidden*/ ctx[4]
    	? /*mouseStateTxt*/ ctx[7]
    	: `Where's the bouss`) + "";

    	let t0$;
    	let t1$;
    	let current_block_type_index$;
    	let if_block$;
    	let current;
    	let dispose;
    	add_render_callback(/*onwindowresize$*/ ctx[17]);
    	const if_block_creators$ = [create_if_block$, create_else_block$];
    	const if_blocks$ = [];

    	function select_block_type$(ctx, dirty) {
    		if (/*gameStarted*/ ctx[0]) return 0;
    		return 1;
    	}

    	current_block_type_index$ = select_block_type$(ctx);
    	if_block$ = if_blocks$[current_block_type_index$] = if_block_creators$[current_block_type_index$](ctx);

    	const block$ = {
    		c: function create() {
    			main$ = element("main");
    			h1$ = element("h1");
    			t0$ = text(t0$_value$);
    			t1$ = space();
    			if_block$.c();
    			attr_dev(h1$, "class", "svelte-1iyp657");
    			add_location(h1$, file$, 175, 2, 3795);
    			attr_dev(main$, "class", "svelte-1iyp657");
    			toggle_class(main$, "hover", /*mouseState*/ ctx[5] === 0 && /*itemHidden*/ ctx[4]);
    			add_location(main$, file$, 174, 0, 3718);
    		},
    		l: function claim(nodes) {
    			throw new Error$("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main$, anchor);
    			append_dev(main$, h1$);
    			append_dev(h1$, t0$);
    			append_dev(main$, t1$);
    			if_blocks$[current_block_type_index$].m(main$, null);
    			current = true;

    			dispose = [
    				listen_dev(window$, "mousemove", /*setMouseState*/ ctx[11], false, false, false),
    				listen_dev(window$, "resize", /*onwindowresize$*/ ctx[17]),
    				listen_dev(main$, "click", /*revealItem*/ ctx[10], false, false, false)
    			];
    		},
    		p: function update(ctx, [dirty]) {
    			if ((!current || dirty & /*itemHidden, mouseStateTxt*/ 144) && t0$_value$ !== (t0$_value$ = (/*itemHidden*/ ctx[4]
    			? /*mouseStateTxt*/ ctx[7]
    			: `Where's the bouss`) + "")) set_data_dev(t0$, t0$_value$);

    			let previous_block_index$ = current_block_type_index$;
    			current_block_type_index$ = select_block_type$(ctx);

    			if (current_block_type_index$ === previous_block_index$) {
    				if_blocks$[current_block_type_index$].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks$[previous_block_index$], 1, 1, () => {
    					if_blocks$[previous_block_index$] = null;
    				});

    				check_outros();
    				if_block$ = if_blocks$[current_block_type_index$];

    				if (!if_block$) {
    					if_block$ = if_blocks$[current_block_type_index$] = if_block_creators$[current_block_type_index$](ctx);
    					if_block$.c();
    				}

    				transition_in(if_block$, 1);
    				if_block$.m(main$, null);
    			}

    			if (dirty & /*mouseState, itemHidden*/ 48) {
    				toggle_class(main$, "hover", /*mouseState*/ ctx[5] === 0 && /*itemHidden*/ ctx[4]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block$);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block$);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main$);
    			if_blocks$[current_block_type_index$].d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block$,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block$;
    }

    function getRandomPos(x, y, w, h) {
    	return [Math.round(Math.random() * w + x), Math.round(Math.random() * h + y)];
    }

    function getDistance(a, b) {
    	return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
    }

    function instance$($$self, $$props, $$invalidate) {
    	let gameStarted = false;

    	let items = [
    		{
    			name: "Bouss",
    			unlockPts: 0,
    			ptsWhenFound: 1,
    			dimensions: [64, 64],
    			mouseStates: [32, 64, 128, 256, 512]
    		},
    		{
    			name: "PC a Smile",
    			unlockPts: 5,
    			ptsWhenFound: 2,
    			dimensions: [56, 56],
    			mouseStates: [32, 64, 128, 256, 512]
    		},
    		{
    			name: "Le Cerveau de Tibis",
    			unlockPts: 15,
    			ptsWhenFound: 5,
    			dimensions: [48, 48],
    			mouseStates: [32, 64, 128, 256, 512]
    		},
    		{
    			name: "La démocratie",
    			unlockPts: 50,
    			ptsWhenFound: 15,
    			dimensions: [32, 32],
    			mouseStates: [32, 64, 128, 256, 512]
    		},
    		{
    			name: "Le père a PK",
    			unlockPts: 500,
    			ptsWhenFound: 1000,
    			dimensions: [16, 16],
    			mouseStates: [32, 64, 128, 256, 512]
    		}
    	];

    	let innerWidth, innerHeight;
    	let itemPos = [0, 0];
    	let itemHidden = true;
    	let mouseState = 4; // 0: Hover, 1: Very Close, 2: Close, 3: Far, 4:Very Far, 5: Where tf are u??!
    	let score = 0;
    	let audioPlayers;
    	let timer;

    	function startGame() {
    		randomizeItemPos();

    		audioPlayers = [
    			"./src/sounds/513_Brawl.mp3",
    			"./src/sounds/ray1.mp3",
    			"./src/sounds/ray2.mp3",
    			"./src/sounds/ray3.mp3",
    			"./src/sounds/ray4.mp3",
    			"./src/sounds/ray5.mp3"
    		];

    		console.log(audioPlayers);

    		timer = setInterval(
    			() => {
    				playSound();
    			},
    			500
    		);

    		$$invalidate(0, gameStarted = true);
    	}

    	function randomizeItemPos() {
    		$$invalidate(3, itemPos = getRandomPos(32, 32, innerWidth - 32, innerHeight - 32));
    		$$invalidate(4, itemHidden = true);
    	}

    	function revealItem() {
    		if (!itemHidden || mouseState !== 0) return;
    		$$invalidate(6, score += 1);
    		$$invalidate(4, itemHidden = false);
    	}

    	function setMouseState(e) {
    		const m = [event.clientX, event.clientY];
    		$$invalidate(5, mouseState = getMouseState(m));
    	}

    	function getMouseState(m) {
    		const dist = getDistance(itemPos, m);
    		if (dist < 32) return 0;
    		if (dist < 64) return 1;
    		if (dist < 128) return 2;
    		if (dist < 256) return 3;
    		if (dist < 512) return 4;
    		return 5;
    	}

    	function playSound() {
    		if (!gameStarted || !itemHidden) return;
    		console.log("play", mouseState);
    		new Audio(audioPlayers[mouseState]).play();
    	}

    	function onwindowresize$() {
    		$$invalidate(1, innerWidth = window$.innerWidth);
    		$$invalidate(2, innerHeight = window$.innerHeight);
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("gameStarted" in $$props) $$invalidate(0, gameStarted = $$props.gameStarted);
    		if ("items" in $$props) items = $$props.items;
    		if ("innerWidth" in $$props) $$invalidate(1, innerWidth = $$props.innerWidth);
    		if ("innerHeight" in $$props) $$invalidate(2, innerHeight = $$props.innerHeight);
    		if ("itemPos" in $$props) $$invalidate(3, itemPos = $$props.itemPos);
    		if ("itemHidden" in $$props) $$invalidate(4, itemHidden = $$props.itemHidden);
    		if ("mouseState" in $$props) $$invalidate(5, mouseState = $$props.mouseState);
    		if ("score" in $$props) $$invalidate(6, score = $$props.score);
    		if ("audioPlayers" in $$props) audioPlayers = $$props.audioPlayers;
    		if ("timer" in $$props) timer = $$props.timer;
    		if ("mouseStateTxt" in $$props) $$invalidate(7, mouseStateTxt = $$props.mouseStateTxt);
    	};

    	let mouseStateTxt;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*mouseState*/ 32) {
    			 $$invalidate(7, mouseStateTxt = (state => {
    				switch (state) {
    					case 0:
    						return "Trouvé!";
    					case 1:
    						return "Tout près";
    					case 2:
    						return "Pas loin";
    					case 3:
    						return "Loin";
    					case 4:
    						return "Très loin";
    					default:
    						return "Euh... t'es parti où là??!";
    				}
    			})(mouseState));
    		}
    	};

    	return [
    		gameStarted,
    		innerWidth,
    		innerHeight,
    		itemPos,
    		itemHidden,
    		mouseState,
    		score,
    		mouseStateTxt,
    		startGame,
    		randomizeItemPos,
    		revealItem,
    		setMouseState,
    		audioPlayers,
    		timer,
    		items,
    		getMouseState,
    		playSound,
    		onwindowresize$
    	];
    }

    class App$ extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App$",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App$({
      target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
