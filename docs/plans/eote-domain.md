# eote.quest domain plan (owner decision 2026-11-12)

- eote.quest stays the main game domain; endsoftheearthgame.com keeps its Porkbun 301 to eote.quest.
- On Colossus hosting: canonical host www.eote.quest via CNAME at Porkbun, no nameserver move.
- Apex eote.quest -> 301 to https://www.eote.quest, path and query kept.
- DNS stays at Porkbun (owner-controlled); MX/SPF records untouched.
- GitHub Pages stays live until the new host passes a test. PA sets records with the Porkbun DNS key.

## Open
- Colossus serves sites through a Cloudflare tunnel; its documented custom-domain path
  (onboardCustomDomain) adds the domain as a Cloudflare zone, i.e. a nameserver move.
  A plain external CNAME to a tunnel host does not resolve unless the platform supports
  Cloudflare custom hostnames (Cloudflare for SaaS). Confirm before sending records.
- Porkbun does not do ALIAS-to-301 for the apex by itself; apex redirect needs Porkbun URL
  forwarding (as endsoftheearthgame.com already uses) or an A record to a redirect responder.
