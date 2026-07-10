# Research: TestFlight / Android Sideload Deployment — MHTL Wealth

Scope: exact minimum-cost path to privately install the MHTL Wealth app (React Native + Expo, EAS Build) on the user's and his wife's iPhones and Android phones, with no public store launch (D24), reconciling the "avoid the $99/year Apple Developer Program" wish (D25) against the reality of what Apple actually requires. Researched July 2026.

---

## 1. Summary

- **There is no free equivalent to TestFlight on iOS.** Every form of distributing a build to a device you don't personally have plugged into a cable — TestFlight, Ad Hoc, Enterprise, App Store — requires an active **Apple Developer Program membership ($99 USD/year)**. This is confirmed as unchanged for 2026. D25's framing is accurate and does not need revision.
- The only genuinely free iOS option is a **local Xcode build signed with a free/personal Apple ID**, installed by physically connecting the iPhone to a Mac via cable (or Wi-Fi debugging paired once via cable). This produces an app that **expires and stops launching after 7 days**, at which point it must be rebuilt and reinstalled from the same Mac. It also cannot be distributed as a link/QR code to someone else's phone — the wife's iPhone would need to be physically connected to the same Mac (or her own Mac) every single week.
- **EAS cloud builds (`eas build`) cannot be used at all for iOS device installs under a free Apple ID.** EAS needs App Store Connect API access to generate certificates and ad-hoc provisioning profiles, which is a paid-account-only capability. The free-Apple-ID path is local-only: `npx expo prebuild` + Xcode, run directly on the cabled device — no EAS Build, no Expo Orbit install-by-link, no QR code.
- Verdict on tolerability: **weekly mandatory cable reinstalls on two non-technical daily users' phones is not a workable long-term arrangement.** It is fine for the solo development/testing period (consistent with D25's own phrasing: "builds de dev gratuits... pour les tests solo pendant le développement"), but it will visibly break for the wife the first time she misses a week, and every week thereafter forces the user to physically take her phone. This research recommends treating the $99/year Apple Developer Program as the practical cost of "the wife can actually use this app," not as a nice-to-have — see Section 6.
- **Android is fully free with no caveats.** `eas build --platform android --profile preview` (buildType `apk`, distribution `internal`) produces a signed APK downloadable via a link/QR code from EAS, installable directly (sideload) with no Google Play Developer account, no expiration, and no per-device registration. This is a clean, permanent, zero-cost solution on Android for both the user and his wife (if either or both use Android phones).
- **EAS Build free tier**: 30 builds/month total (15 iOS + 15 Android, lower priority in the build queue, ~45 min build timeout) — more than sufficient for a 2-person household app's build cadence, on both the free-Xcode-local iOS path (which doesn't even consume EAS Build quota, since it's not an EAS cloud build) and the Android APK path (which does consume quota, ~1 build per release/test cycle).

---

## 2. Free-Tier iOS Path (with honest friction assessment)

### 2.1 What "free" actually means for iOS

Apple offers exactly one free tier of code signing: a **personal/free Apple ID**, shown in Xcode as a "Personal Team." It grants:

- The ability to build and run your own app on **your own device(s)**, connected by cable to the Mac doing the build, directly through Xcode (or `npx expo run:ios --device`).
- A maximum of a small number of registered devices per Apple ID (historically 3, subject to change) and a maximum of a handful of App IDs at a time.
- Signing certificates/provisioning profiles that are valid for **7 days only**. After 7 days the app icon still shows on the phone but the app refuses to launch ("Unable to Verify App") until it is rebuilt and reinstalled from the Mac.
- **No cloud distribution mechanism whatsoever.** A free-Apple-ID-signed build cannot be uploaded anywhere and downloaded/installed by someone else — it can only be pushed from Xcode (or `expo run:ios`) directly onto a device physically tethered by USB/Wi-Fi-debugging to that specific Mac.

### 2.2 Why EAS Build (the cloud build service) doesn't help here

EAS Build's iOS pipeline works by talking to the **App Store Connect API** to create/manage signing certificates, App IDs, and (for internal/ad-hoc distribution) provisioning profiles with an allow-list of device UDIDs (`eas device:create` registers a device into this list). All of that App Store Connect API access is gated behind an **enrolled, paid Apple Developer Program membership** — a free Apple ID has no App Store Connect access at all, so EAS Build cannot generate any iOS artifact for a free account. This applies to every iOS build profile (`development`, `preview`/internal, `production`) run through `eas build`, not just TestFlight submissions.

Practical implication: **the "free path" and "EAS cloud build" are mutually exclusive on iOS.** The free path is:

```bash
npx expo prebuild -p ios          # generate the native ios/ project locally
xed ios                           # open the Xcode workspace
# In Xcode: Signing & Capabilities → "Automatically manage signing" →
# sign in with the free Apple ID → select the connected iPhone as the run target
npx expo run:ios --device         # or press Run in Xcode
```

This **requires a Mac** (Xcode only runs on macOS) and a physical USB/Wi-Fi cable pairing with each iPhone being installed to.

### 2.3 Weekly renewal workflow

Once the 7-day certificate expires:

1. Reconnect the target iPhone to the Mac via cable.
2. Re-run `npx expo run:ios --device` (or re-press Run in Xcode) — this re-signs and reinstalls the app in place.
3. On the phone, if prompted, re-trust the developer certificate under Settings → General → VPN & Device Management (previously Device Management) → [certificate] → Trust.

For push notification capability specifically: a free personal team **cannot** enable the Push Notifications entitlement at all (it requires a paid account), so any free-tier iOS build must have that capability stripped — directly conflicting with D21 (anomaly push alerts) and D26 (sync-failure push alerts) for the iOS side, until the user upgrades to a paid account. In-app banner alerts would still work; push would not.

### 2.4 Tolerability verdict for two non-technical daily users

Not tolerable as a steady state:

- The user's own phone: workable as a personal nuisance during active development (he already needs to be at his dev machine regularly).
- The wife's phone: requires the user to physically bring her iPhone to his Mac (or bring his Mac to her) roughly every 7 days, indefinitely, for as long as the app is used. One missed week means the app silently stops opening ("Unable to Verify App") with no in-app warning — a bad experience for a household finance app she's expected to check regularly. There is also no push notification support at all on this path (see 2.3), which directly weakens D21/D26.
- This friction is appropriate **only** for the solo pre-launch testing phase the user is already doing (which is exactly what D25 scoped it for: "pour les tests solo pendant le développement"). It should not be presented as the ongoing distribution mechanism once the wife is meant to use the app regularly.

---

## 3. Paid iOS Path (TestFlight proper)

Once the Apple Developer Program ($99/year) is purchased, TestFlight for **internal testing** is comfortable and low-friction:

### 3.1 One-time setup

1. Enroll at developer.apple.com (99 USD/year, auto-renews; personal or organization account — personal is sufficient for a private household app).
2. In **App Store Connect**, create a new app record (bundle ID matching the Expo app config, e.g. `com.mhtl.wealth`), even though it will never be submitted to the public App Store.
3. Configure EAS credentials: `eas credentials` (or let `eas build` auto-manage certificates/profiles once it detects the paid account) to generate a Distribution certificate and provisioning profile.
4. Build for TestFlight: `eas build --platform ios --profile production` (or a dedicated `testflight` profile in `eas.json`), then `eas submit --platform ios` to upload the `.ipa` to App Store Connect.

### 3.2 Internal testing (no App Review)

- **Internal testers** in App Store Connect are limited to **up to 100 people**, but crucially they must each be a **user on your App Store Connect team** (added under Users and Access, e.g. as an "App Manager" or "Developer" role, or specifically a "Customer Support"/tester-only role if using the more limited access tiers).
- Add the wife's Apple ID email as a team member first (Users and Access → Invite), then add her as an internal tester in TestFlight → Internal Testing → the default group (or a new group) — she'll get an email/App Store Connect notification inviting her.
- Builds assigned to an internal group become available **immediately, with no Apple Beta App Review** — this is the single biggest practical upgrade over ad hoc: no 24–48h review wait, no device UDID pre-registration/rebuild cycle, and crucially **builds do not expire on a 7-day cycle** — TestFlight builds are valid for 90 days from upload, and re-uploading a new build (e.g. weekly during active dev) simply extends availability, with testers getting a push notification that an update is ready to install via the TestFlight app.
- She installs the free **TestFlight** app from the App Store once, accepts the invite link, and from then on gets in-app update notifications — no cables, no Xcode, no expiring certs to babysit weekly.
- Push notifications, biometric APIs, and all normal capabilities work normally on a paid account (unlike the free tier), which matters directly for D21/D26 (push alerts).

### 3.3 External testing (not needed here, noted for completeness)

External testing (up to 10,000 testers via a public link) requires a one-time Apple Beta App Review per new build's first submission — not relevant for a 2-person household app; internal testing alone fully covers this use case and should be the only mode used.

---

## 4. Android Sideload Path (fully free)

This path has **no paid component at any point** and no caveats worth flagging — it is the clean side of this research.

### 4.1 Build

In `eas.json`, ensure a profile like:

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

Then:

```bash
eas build --platform android --profile preview
```

This produces a signed `.apk` (EAS auto-generates and stores an Android keystore on first build — no Google account of any kind needed to sign it) and gives a build details page with a **downloadable link and QR code**.

### 4.2 Distribution — no Google Play account needed at all

- Share the EAS build link (or QR code) with the wife directly (text/email/AirDrop-equivalent).
- She opens the link on her Android phone, taps to download the `.apk`, and installs it.
- **Google Play Developer account (the one-time $25 fee mentioned in D25) is not required for this path at all** — that fee is only relevant if/when the user later wants to publish through the Play Store itself, which D24 explicitly rules out for v1.

### 4.3 Enabling "install from unknown sources" on her phone

Modern Android (8/Oreo and later, i.e. effectively every phone in use in 2026) uses **per-app** permission rather than a single global toggle:

- On stock Android 13/14/15 (Pixel and most non-Samsung phones): Settings → Apps → Special app access → Install unknown apps → select the app being used to open the file (Chrome, Files, or whatever messaging app the APK link was opened from) → toggle "Allow from this source" on.
- On Samsung (One UI): Settings → Biometrics and Security → Install unknown apps → select the source app → toggle on.
- The prompt to enable this typically appears automatically the first time she taps "Install" on the downloaded APK, with a direct link into the relevant settings screen — she does not need to hunt for it manually.
- It is reasonable, for cleanliness, to toggle the permission back off after installing (optional; not required for the app to keep working — Android only checks this permission at install/update time, not at every launch).

### 4.4 Updates

Every new APK build must be reinstalled the same way (download new link → install; Android will prompt "update" if the package name/signing key match the existing install, replacing in place without data loss as long as the same EAS-managed keystore signs every build). There is no auto-update mechanism for sideloaded APKs — each new test build is a manual re-download, but with **no expiration timer** unlike the iOS free path. Over-the-air JS-only updates (no new native code) can additionally be pushed via **EAS Update** without a new APK install at all, which is worth adopting once the app is stable, further reducing reinstall frequency on both platforms.

---

## 5. EAS Build Free Tier Limits

(Applies to the Expo "Free" plan, no paid EAS subscription — verified against Expo's 2026 pricing structure.)

| Limit | Free tier |
|---|---|
| Builds per month | 30 total (15 iOS + 15 Android) |
| Build priority | Lowest priority queue (paid plans get priority queuing; free builds can wait longer at peak load) |
| Build timeout | 45 minutes per build (2-hour timeout is a paid-plan feature) |
| Concurrency | 1 concurrent build on free tier |
| EAS Update (OTA JS updates) | Included, up to 1,000 monthly active users and a bandwidth allowance (100 GiB shared edge bandwidth) — irrelevant at household scale |
| Cost of Apple Developer Program itself | **Not included/waived by any Expo plan** — Expo/EAS pricing is entirely separate from and does not substitute for Apple's own $99/year fee; EAS is only the build/distribution tooling, not the Apple account |

Practical read for this project: 30 builds/month is generous for a 2-user household app. Even during active development with frequent iteration, a build cadence of a few Android APK builds per week plus occasional iOS builds (once/if on a paid Apple account) sits comfortably inside the free tier; the free tier's only real constraint (lower queue priority) means occasional multi-minute waits at peak EAS load times, not a functional blocker.

---

## 6. Final Recommendation

**Recommend the user pay the $99/year Apple Developer Program**, and treat this as a deliberate, flagged exception to D3/D25's "minimal/free budget" preference — not a silent overreach of it.

Reasoning to put in front of the user:

1. D25 already anticipated this exact fork ("le passage à un vrai compte développeur Apple ne sera nécessaire que si l'utilisateur veut un TestFlight confortable pour son épouse... décision à reconfirmer avec l'utilisateur en Phase 5"). This research is that reconfirmation point, and the concrete friction analysis in Section 2.4 makes the case squarely: the free path means physically cabling the wife's iPhone to a Mac every 7 days, forever, with no push notifications and a silent failure mode ("Unable to Verify App") that a non-technical daily user will not self-diagnose.
2. $99/year (~8.25 USD/month) is a trivial sum relative to D3's real intent — D3 is about avoiding *recurring per-API-call* costs on data-aggregation infrastructure (Powens production tier, priced per connected account) that scale with usage and could balloon; it was never really about a flat, predictable, low annual platform fee. Bucketing the Apple fee under the same "minimal budget" umbrella as Powens production pricing conflates two very different cost shapes.
3. The Android side stays **entirely free regardless** — this recommendation only changes the iOS answer. If the household is Android-only (worth re-confirming — D25's framing suggests at least the user has an iPhone since TestFlight was named explicitly in D24), the entire iOS cost question is moot and the free Android sideload path alone may be sufficient for v1.
4. If the user still wants to defer the $99 spend past Phase 5, the fallback is not "free TestFlight" (it doesn't exist) but "keep both users on the 7-day local-Xcode cable path a while longer" — acceptable for a few more weeks of active solo development, but this research recommends explicitly setting a decision checkpoint (e.g., "the day the wife is expected to use the app for real, weekly, without the developer's involvement") rather than letting the friction be discovered the hard way.

Action for Phase 5: present this file to the user as the basis for reconfirming D25, with a direct yes/no ask: *"Pay $99/year now to give your wife a real TestFlight experience (instant, no cables, push notifications work), or stay on the free 7-day local-reinstall workflow a while longer?"*

---

## 7. References / Sources

- [iOS Distribution Guide 2026: TestFlight, App Store & Enterprise — Foresight Mobile](https://foresightmobile.com/blog/ios-app-distribution-guide-2026)
- [Apple Developer Program License Agreement — Apple Developer](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- [Apple Developer Program — Apple Developer](https://developer.apple.com/programs/)
- [Apple Developer Enterprise Program — Apple Developer](https://developer.apple.com/programs/enterprise/)
- [Understanding Apple App Signing Types — Applivery](https://www.applivery.com/docs/faq/faq/understanding-apple-app-signing-types/)
- [Internal distribution — Expo Documentation](https://docs.expo.dev/build/internal-distribution/)
- [Create and share internal distribution build — Expo Documentation](https://docs.expo.dev/tutorial/eas/internal-distribution-builds/)
- [Apple Developer Program roles and permissions for EAS Build — Expo Documentation](https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/)
- [Distribute iOS mobile applications (without App Store) — DEV Community](https://dev.to/vimaltwit/distribute-ios-mobile-applicationswithout-app-store-1260)
- [EAS: Apple Developer account needed while it should be optional — expo/eas-cli issue #997](https://github.com/expo/eas-cli/issues/997)
- [No way to build iOS preview without paid account? — expo/expo discussion #27489](https://github.com/expo/expo/discussions/27489)
- [Yvaine — Create Development Builds Without an Apple Developer Program](https://yvainee.com/blog/create-development-builds-without-an-Apple-Developer-Program)
- [Build APKs for Android Emulators and devices — Expo Documentation](https://docs.expo.dev/build-reference/apk/)
- [Create and run a cloud build for iOS device — Expo Documentation](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/)
- [Expo Orbit — Expo Documentation](https://docs.expo.dev/build/orbit/)
- [Expo Orbit — expo/orbit GitHub](https://github.com/expo/orbit)
- [TestFlight overview — App Store Connect Help — Apple Developer](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [Add internal testers — App Store Connect Help — Apple Developer](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/)
- [TestFlight Beta Testing: The Complete Guide for iOS Developers](https://iossubmissionguide.com/testflight-beta-testing-complete-guide/)
- [iOS App Distribution & Best Practices, Chapter 6: TestFlight — Kodeco](https://www.kodeco.com/books/ios-app-distribution-best-practices/v1.0/chapters/6-testflight)
- [Expo Pricing 2026: Plans, Costs & What You'll Actually Pay](https://checkthat.ai/brands/expo/pricing)
- [Expo Application Services Pricing — expo.dev/pricing](https://expo.dev/pricing)
- [Enforcement of EAS Free plan limits — Expo Changelog](https://expo.dev/changelog/2023-08-01-eas-free-plan-limits)
- [Expo App Development Costs in 2026: EAS Pricing, Build Costs & Hidden Fees — metacto](https://www.metacto.com/blogs/the-true-cost-of-expo-app-development-a-comprehensive-guide)
- [Install Android Apps from Unknown Sources: IT Admin Guide — Appaloosa](https://www.appaloosa.io/blog/guides/how-to-install-apps-from-unknown-sources-in-android)
- [Allow Unknown Sources App Installation in All Android versions — Android Infotech](https://www.androidinfotech.com/unknown-sources-app-installation-android/)
- [Choosing a Membership — Apple Developer Support](https://developer.apple.com/support/compare-memberships/)
