<div align="center">

# rn-android-kit

**Short Android commands for React Native developers.**

![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![macOS and Linux](https://img.shields.io/badge/macOS%20%7C%20Linux-supported-555555)
![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)

Build, install, launch, debug, and mirror Android apps without remembering long Gradle or ADB commands.

</div>

## Install

From npm after publication:

```sh
npm install --global rn-android-kit
```

Directly from GitHub:

```sh
npm install --global github:<owner>/rn-android-kit
```

Then verify:

```sh
rn --version
rn --help
```

## The everyday workflow

```mermaid
flowchart LR
    A["rn apk"] --> B["rn open"] --> C["rn install"] --> D["rn launch"] --> E["rn logs"]
```

```console
$ rn apk
Building APK with ./gradlew assembleRelease ...
Built: /MyApp/android/app/build/outputs/apk/release/app-release.apk

$ rn install
Installing app-release.apk on Pixel 9 ...
Success

$ rn launch
App launched.

$ rn logs error
Showing error+ logs for com.example.app on Pixel 9.
```

## Commands

| | Command | Purpose |
| --- | --- | --- |
| 📦 | `rn apk` | Build a release APK |
| 📦 | `rn aab` or `rn bundle` | Build a release Android App Bundle |
| 📂 | `rn open [apk\|aab]` | Reveal the newest artifact |
| 📲 | `rn install` | Install the newest APK; build one if missing |
| 🗑️ | `rn uninstall` or `rn remove` | Uninstall the project app |
| 🚀 | `rn launch` | Open the installed project app |
| 🚀 | `rn lauch` | Spelling-friendly alias for `rn launch` |
| 🪵 | `rn logs` | Stream detailed app logs |
| 🔐 | `rn report` | Show signing store, alias, MD5, SHA-256, and validity |
| 🖥️ | `rn screen` or `rn scrcpy` | Mirror and control a device with scrcpy |

### Build variants

```sh
rn apk                         # release APK
rn apk --debug                 # debug APK
rn apk --variant demoRelease   # custom variant
rn aab --variant productionRelease
rn install --build             # rebuild before installing
```

### Focused logs

```sh
rn logs                 # all app logs
rn logs warn            # warnings and higher
rn logs error           # errors and fatal logs
rn logs js              # ReactNativeJS only
rn logs js error        # ReactNativeJS errors only
```

Log output includes time, severity, tag, PID, and TID. Levels are colored in interactive terminals.
Press Ctrl+C to stop.

### Signing report

```console
$ rn report

debug
  Store: /MyApp/android/app/debug.keystore
  Alias: androiddebugkey
  MD5: 20:F4:61:...
  SHA-256: FA:C6:17:...
  Valid until: Wednesday, 1 May, 2052
```

Debug, release, and flavor variants are included. Gradle task noise and SHA1 are hidden.

## Smart device selection

One device is selected automatically. With multiple devices:

```console
$ rn screen

Choose a device:
  1) Pixel 9  (emulator-5554)
  2) Galaxy S24  (R5CT123456)
Device [1-2]:
```

For scripts, pass the serial directly:

```sh
rn install --device emulator-5554
rn logs --device emulator-5554
rn screen --device emulator-5554
```

Duplicate macOS wireless-debugging aliases such as `device` and `device (2)` are treated as one phone.

## Smart project detection

Run project commands from the React Native root, `android/`, or a nested directory.
`rn-android-kit` automatically:

- Finds `android/gradlew` and `android/app` by walking upward.
- Finds the newest APK or AAB under `android/app/build/outputs`.
- Detects the package from Gradle, AndroidManifest, or Expo `app.json`.
- Asks for the package when it cannot be detected.

You can also provide a package explicitly from any directory:

```sh
rn launch com.example.app
rn logs com.example.app
rn uninstall com.example.app
```

> [!WARNING]
> `rn uninstall` removes the app and its local data from the selected device.

## Requirements

- macOS or Linux
- Node.js 18+
- Android platform-tools (`adb`) for device commands
- [scrcpy](https://github.com/Genymobile/scrcpy) for `rn screen`

Install scrcpy on macOS with:

```sh
brew install scrcpy
```

## Update or remove

```sh
npm update --global rn-android-kit
npm uninstall --global rn-android-kit
```

For a GitHub installation, rerun the GitHub install command to update.

## Development

```sh
npm ci
npm run verify
```

The CLI has no runtime dependencies. Contributions are welcome; see
[CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Dheeraj Rao
