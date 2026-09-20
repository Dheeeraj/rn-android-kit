# Changelog

All notable changes to `rn-android-kit` are documented here.

The project follows [Semantic Versioning](https://semver.org/).

## [0.6.0] - 2026-09-21

### Added

- Memorable APK and AAB build commands with custom variant support.
- Recursive artifact discovery and Finder/Linux file-manager integration.
- APK installation with automatic device selection.
- Application uninstall and launch with package detection.
- Detailed application logcat streaming with severity and ReactNativeJS filters.
- UID-based log filtering with PID fallback.
- scrcpy screen mirroring with shared device selection.
- Concise signing reports for debug, release, and flavor variants.
- macOS wireless-debugging alias deduplication.

### Supported aliases

- `rn bundle` for `rn aab`
- `rn remove` for `rn uninstall`
- `rn lauch` for `rn launch`
- `rn scrcpy` for `rn screen`
