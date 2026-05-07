# Kalpa Starter Template Library

This is the small starter template library for the MVP slide generator.

It is intentionally small. The goal is to keep token use, render complexity, and storage needs low by reusing a handful of trusted Kalpa-branded slide archetypes instead of generating completely custom slide code for every request.

## Why this exists

HyperFrames gives the app an animation and rendering engine. This library gives the app a stable content system:

- known slide archetypes
- known content slots
- known animation presets
- known Kalpa styling rules

That lets the app decide:

- how many slides to generate
- which archetype fits each slide
- which animation preset to apply
- what content belongs in each slot

without needing to invent a whole new composition system every time.

## Starter templates included

- `kalpa-hero-opener`
- `kalpa-challenge-stack`
- `kalpa-proof-stats`
- `kalpa-process-roadmap`
- `kalpa-industry-grid`
- `kalpa-offer-comparison`
- `kalpa-cta-close`

## Starter animation presets included

- `hero-sweep`
- `fade-rise`
- `card-rise-stagger`
- `number-pulse`
- `timeline-draw`
- `subtle-loop`

## Source references

The templates are based on:

- the Kalpa brand book in `AI Video + Images/Replit Design Book/Kalpa Brand Book/`
- the live-site content rhythm from `https://www.kalpainc.com/`

## Preview

Open the static preview page after running the starter app:

- `/template-library/index.html`

## Storage impact

This library is tiny compared to rendered media. Keeping these template definitions permanently is cheap. The heavy assets are rendered GIFs, MP4s, and uploaded media, which should still be deleted after the 48-hour retention window.
