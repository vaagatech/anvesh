# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes |

## Reporting a vulnerability

Email **info@vaagatech.com** with a description, impact, and reproduction steps. Do not open a public issue for unreleased vulnerabilities.

We aim to acknowledge reports within a few business days.

## Hardening defaults

- Prefer setting `ANVESH_API_KEY` outside local development.
- Use encrypted storage backends and TLS for Redis/Mongo.
- Keep Hub behind your own auth when exposing it publicly.
