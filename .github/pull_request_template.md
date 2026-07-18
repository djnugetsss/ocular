## What changed

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- The reasoning, not a restatement of the diff. -->

## Verification

<!-- What you actually ran, not what should pass. -->

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] Exercised on a physical iPhone (required for camera/Vision changes)

## Native changes

<!-- Delete if this PR does not touch modules/ocular-vision/. -->

- [ ] Add the `native` label so CI compiles the iOS target
- [ ] `OcularVision.types.ts` and `OcularVisionPayload.swift` still agree
- [ ] Verified against a real face — thresholds cannot be validated by tests alone
