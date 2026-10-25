# DRAFT – requires review by a qualified lawyer and store reviewer

This is an engineering checklist, not a certification or statement of store compliance. Reconfirm current policies and listing requirements when submitting. Official references: [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) and [Microsoft Edge Add-ons Developer Policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies).

## Product disclosures to keep aligned

- State the single purpose clearly: sync a user's own LeetCode Accepted solution to the user's selected GitHub repository.
- Explain that extension page access is limited to LeetCode domains and the configured LeetSync dashboard/API origin; it reads the LeetCode username and accepted-submission data needed for sync.
- Explain that source code and metadata are sent to the LeetSync backend and then to GitHub, and that the canonical repository is public in the current product flow.
- Link the final privacy policy and a working support contact from the listing, onboarding, and product UI.
- Request only `storage`, `alarms`, and exact host permissions required by the implementation. Avoid broad host matches and remote executable code.
- Ensure listing screenshots, claims, permissions, privacy disclosures, and behavior describe the same product. Do not claim automatic installation; users install from the official store.

## Remaining release evidence

- Submit the extension to both stores and receive approval; record the final listing URLs and publisher verification requirements.
- Complete each store's privacy/data-use forms and permission justifications using the final build and reviewed privacy policy.
- Verify user consent is clear before collection, and that disconnect/uninstall behavior and queued data are disclosed accurately.
- Run clean-profile install, account pairing, Accepted capture, duplicate handling, disconnect, and uninstall checks for each browser/store build.
- Legal counsel must review the privacy disclosures and the LeetCode integration before public distribution. No store approval or legal compliance is implied by this checklist.
