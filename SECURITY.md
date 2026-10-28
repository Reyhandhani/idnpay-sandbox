# Security

## Scope

idnpay-sandbox is a development and testing tool. It never moves real money and has no connection to banks or e-Wallet providers.

Reports still matter when they affect people running the simulator, for example:

- Bypassing the `X-Client-Key` check
- Forging a webhook signature, or getting a bad signature accepted
- Leaking `SECRET_KEY` or `CLIENT_KEY` through logs, responses, or the dashboard
- Injection or code execution through input the simulator accepts
- Vulnerabilities in dependencies we use directly

## Reporting

Do not open a public issue for a vulnerability. Report it privately through [Security Advisories](https://github.com/Reyhandhani/idnpay-sandbox/security/advisories/new).

Include:

- The version or commit you tested
- Steps to reproduce
- The impact you expect

This is a volunteer project, so a reply may take a few days. Once a fix is out, we will credit you in the release notes if you want the credit.

## Safe usage

- Change `CLIENT_KEY` and `SECRET_KEY` before anyone else can reach the simulator.
- Do not expose the port to the internet without an extra authentication layer.
- The simulator sends HTTP POST requests to any `callback_url` it receives. Run it on a network you trust.
