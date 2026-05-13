# DiscoMod

A mod manager for Dead as Disco. Handles installing, toggling, and organizing mods and custom songs so you don't have to mess with folders manually.

## Features

- **Mod Management**: Install, rename, delete, and toggle `.pak` mods with ease.
- **Custom Themes**: Create and apply custom CSS themes dynamically from the themes directory.
- **Song Library**: Import, preview (built-in player), and organize custom tracks.
- **Automated Setup**: One-click UE4SS installation and automatic management of `~mods` and `LogicMods` PAK directories.
- **Integration**: Download songs directly from DiscoMaps or browse and fetch Nexus Mods in-app.
- **High Performance**: Built with Rust and Tauri for a lightweight, secure experience.

## Getting Started

Requires Node.js (v22+), pnpm, and Rust.

```bash
git clone https://github.com/thororen1234/DiscoMod
pnpm install
pnpm dev
```

On first launch, go to Settings and point DiscoMod at your game folder and mod directory.

## Custom Themes

DiscoMod supports fully custom CSS themes. 
1. Go to **Settings** -> **Open Themes Folder**.
2. See `THEME_TEMPLATE.css` for a starting point.
3. Drop your `.css` file in the folder and it will automatically appear in the app's theme selector.

## Build

```bash
pnpm build
```

## Contributing

Open an issue or pull request all contributions welcome.
