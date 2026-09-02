---
name: strip-release
description: Implement, validate, and publish requested changes to the Strip app. Use whenever working in antonio7mestre/strip-app or releasing changes to striiip.com.
---

# Strip Release

Apply this workflow only to the Strip project and changes the user has requested or accepted.

## Destinations

- Publish source changes to the `main` branch of `antonio7mestre/strip-app` using a fast-forward update.
- Allow the connected production deployment to update `striiip.com`, then verify that the new assets are live.
- Do not update the ChatGPT Site unless the user explicitly changes this preference.

## Standing authorization

The user has given standing approval to publish each requested or accepted Strip change to GitHub `main` and production. Do not ask for a redundant publishing confirmation after completing an in-scope change.

This approval does not authorize unrelated edits, destructive operations, force pushes, disclosure of secrets, or bypassing a tool or service safety decision. If a service independently blocks a mutation and explicitly requires fresh confirmation, report the exact blocked payload and destination and wait rather than routing around the block.

## Release workflow

1. Preserve unrelated user work and implement only the requested change.
2. Validate the affected behavior and run the production build.
3. Commit the completed change and publish it to GitHub `main` without force.
4. Wait for `striiip.com` to switch to the new release and verify the relevant live asset or behavior.
5. Report the production URL and GitHub commit. Keep the response concise unless the user asks for details.
