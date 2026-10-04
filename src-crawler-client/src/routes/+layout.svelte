<script lang="ts">
	import './layout.css';
	import { version } from '../../package.json';

	const { children } = $props();
</script>

<svelte:head>
	<meta name="vrc-packages-version" content={version} />
</svelte:head>

{@render children()}
