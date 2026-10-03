<script lang="ts">
  // import { invoke } from "@tauri-apps/api/core";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { CircleCheckIcon } from "@lucide/svelte";
</script>

<main class="space-y-4">
    <h1>Oh ma gaouwhh</h1>
    <Alert.Root class="max-w-md">
      <CircleCheckIcon />
      <Alert.Title>Account updated successfully</Alert.Title>
      <Alert.Description>
        Your profile information has been saved. Changes will be reflected
        immediately.
      </Alert.Description>
    </Alert.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Card Title</Card.Title>
        <Card.Description>Card Description</Card.Description>
        <Card.Action>Card Action</Card.Action>
      </Card.Header>
      <Card.Content>
        <p>Card Content</p>
      </Card.Content>
      <Card.Footer class="space-x-2.5">
        <Button>
          I think it works
        </Button>
        <Button>
          Or does it?
        </Button>
      </Card.Footer>
    </Card.Root>
</main>
