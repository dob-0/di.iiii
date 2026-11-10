# Security policy

## Report a vulnerability privately

Please do not open a public issue or pull request for a security problem.

Use GitHub's private route, a security advisory:
<https://github.com/dob-0/di.iiii/security/advisories/new>
(or the **Security** tab of this repository, then **Report a vulnerability**).
Only the maintainers see it.

If that page does not let you report (private reporting may not be switched on yet),
open a public issue that says only "I have a security report, please open a private
channel" and put no details in it.

Helpful to include: what you did, what you expected, what happened, the address or
version, and whether a space or its guests are exposed.

## Supported versions

- The `main` branch, which is what runs on diiii.xyz.
- The newest release a machine installed with `di up` can update to.

Older releases are not patched. Update to the newest one.

## Disclosure and timeline

- We answer a report within 7 days, and say whether we can reproduce it.
- We aim to fix a confirmed vulnerability within 90 days, sooner when guests or their
  spaces are exposed.
- Please keep it private until the fix is live. Then we publish the advisory and credit
  you, if you want that.

Do not test against spaces or guests that are not yours.
