# Contributing to rn-android-kit

Thanks for helping make repetitive React Native Android workflows easier.

## Development setup

Requirements:

- Node.js 18 or newer
- npm
- macOS or Linux

Clone the repository and verify the project:

```sh
git clone https://github.com/Dheeeraj/rn-android-kit.git
cd rn-android-kit
npm ci
npm run verify
```

## Making a change

1. Create a focused branch.
2. Keep commands short, predictable, and safe.
3. Add or update tests for every behavioral change.
4. Update the README and changelog when user-facing behavior changes.
5. Run `npm run verify` before opening a pull request.

The CLI intentionally has no runtime dependencies. Prefer Node.js built-ins unless a dependency
provides substantial value that cannot reasonably be implemented in the project.

## Command design

- Commands should work from the React Native root and `android/` whenever possible.
- Device commands must use the shared device chooser when more than one device is connected.
- Non-interactive use should accept explicit `--device` and `--package` values.
- Error messages should include a concrete next action.
- Potentially destructive behavior must be clear in command names and documentation.

## Reporting bugs

Please include:

- `rn --version`
- macOS or Linux version
- Node.js version
- Android platform-tools version
- The command used and its complete error message

Never attach keystores, passwords, signing properties, tokens, or other credentials.
