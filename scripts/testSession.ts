import { readFile } from "node:fs/promises";

import { POST } from "../src/app/api/session/route";

async function main() {
  const worlds = JSON.parse(await readFile("data/worlds.json", "utf8")) as {
    worlds: Array<{ id: string }>;
  };
  const characters = JSON.parse(await readFile("data/characters.json", "utf8")) as {
    characters: Array<{ id: string }>;
  };

  const worldId = worlds.worlds[0]?.id;
  const characterId = characters.characters[0]?.id;

  if (!worldId || !characterId) {
    throw new Error("Не найдены миры или персонажи для теста");
  }

  const request = new Request("http://localhost/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      worldId,
      characterId,
      message: "",
      isInitial: true,
    }),
  });

  const response = await POST(request);
  console.log("Status:", response.status);
  console.log("Body:", await response.json());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

