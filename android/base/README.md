# Base APK

`wax-hub-2.0.apk` is the Capacitor Android shell from **Antelope Hub / WAX Hub**
(https://github.com/SquishEyez/ANThub, MIT licence, © 2026 SquishEyez).

The Working Dead Hub build keeps only the native shell: Capacitor runtime, AndroidX and the
`@capacitor/app` and `@capacitor/status-bar` plugins. The whole web app inside `assets/public`
is replaced. The package id, label, icons, splash screens and version are rewritten, and the
APK is signed with this project's own key. Third-party licences are listed in
`THIRD_PARTY_NOTICES.md`.
