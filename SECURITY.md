# Security policy

## Supported versions

morphfx is pre-1.0. Security fixes are released for the latest published version only.

## Reporting a vulnerability

**Please do not open a public issue.** Report vulnerabilities privately through GitHub: go to the repository's **Security** tab and choose **Report a vulnerability**.

We aim to acknowledge reports within 3 business days and to publish a fix, with credit to the reporter if wanted, as soon as one is ready.

## Scope

`@morphfx/core` only parses and generates path strings: it never touches the DOM, evaluates code or injects markup. Reports about parsing that hangs, crashes or produces unsafe output for crafted input are in scope.
