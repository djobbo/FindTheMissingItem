<script>
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";

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
  $: mouseStateTxt = (state => {
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
  })(mouseState);

  let score = 0;

  onMount(() => {
    randomizeItemPos();
  });

  function getRandomPos(x, y, w, h) {
    return [Math.round(Math.random() * w + x), Math.round(Math.random() * h + y)];
  }

  function randomizeItemPos() {
    itemPos = getRandomPos(32, 32, innerWidth - 32, innerHeight - 32);
    itemHidden = true;
  }

  function revealItem() {
    if (!itemHidden || mouseState !== 0) return;
    score += 1;
    itemHidden = false;
  }

  function getDistance(a, b) {
    return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
  }

  function setMouseState(e) {
    const m = [event.clientX, event.clientY];
    mouseState = getMouseState(m);
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
</script>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }
  main {
    font-family: sans-serif;
    text-align: left;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #f6f4d2;
  }
  main.hover {
    cursor: pointer;
  }

  h1 {
    margin: 0;
    padding: 0;
  }
  h2 {
    margin: 0;
    padding: 0;
  }
  h3 {
    margin: 0;
    padding: 0;
  }
  .item {
    position: fixed;
    width: 64px;
    height: 64px;
    background-color: red;
    z-index: 10;
    opacity: 1;
  }
</style>

<svelte:window bind:innerWidth bind:innerHeight on:mousemove={setMouseState} />

<main
  class:hover={mouseState === 0 && itemHidden}
  on:click={revealItem}>
	<h1>{itemHidden ? mouseStateTxt : `Where's the bouss`}</h1>
	<h2>{ itemHidden ? `Trouve le bouss caché sur cette page!` : `Bravo!` }</h2>
  <h3>Score: {score}</h3>
  {#if !itemHidden}
    <button on:click={randomizeItemPos}>Laisser bouss se cacher</button> 
    <div
      class="item"
      class:itemHidden style="top: {itemPos[1] - 32}px; left: {itemPos[0] - 32}px"
      in:fade out:fly={{ y: -200, duration: 250 }}>
      <img
        src="https://cdn.discordapp.com/attachments/638869924265328641/675004347641233418/unknown.png"
        width="100%"
        height="100%"
        alt="item">
    </div>
  {/if}
</main>