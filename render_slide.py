import json
import math
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "vendor_py"
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

WIDTH = 1536
HEIGHT = 864
FPS = 6
GIF_WIDTH = 960
GIF_HEIGHT = 540

COLORS = {
    "blue": "#007ABE",
    "blue_dark": "#001A29",
    "blue_deep": "#051326",
    "blue_soft": "#7FBCDE",
    "orange": "#ED854D",
    "orange_strong": "#FF8C00",
    "paper": "#F4F4F4",
    "surface": "#FFFFFF",
    "ink": "#0C1728",
    "muted": "#516175",
}


def load_font(size, bold=False, mono=False):
    candidates = []
    if mono:
        candidates.extend(
            [
                "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
                "/System/Library/Fonts/SFNSMono.ttf",
            ]
        )
    elif bold:
        candidates.extend(
            [
                "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/Library/Fonts/Arial Bold.ttf",
            ]
        )
    else:
        candidates.extend(
            [
                "/System/Library/Fonts/Supplemental/Arial.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/Library/Fonts/Arial.ttf",
            ]
        )
    for candidate in candidates:
      if os.path.exists(candidate):
          return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def wrap_text(draw, text, font, max_width):
    words = str(text or "").split()
    if not words:
        return []
    lines = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def rounded_panel(draw, box, fill, outline=None, radius=24, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def load_bg(asset_name):
    image = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(COLORS["blue_dark"]))
    draw = ImageDraw.Draw(image)

    if "hero" in str(asset_name):
        draw.rectangle((0, 0, WIDTH, HEIGHT), fill=hex_to_rgb(COLORS["blue_deep"]))
        draw.polygon(
            [(0, HEIGHT), (0, HEIGHT * 0.24), (WIDTH * 0.48, 0), (WIDTH, 0), (WIDTH, HEIGHT)],
            fill=hex_to_rgb(COLORS["blue"]),
        )
        draw.polygon(
            [(WIDTH * 0.54, 0), (WIDTH, 0), (WIDTH, HEIGHT * 0.44), (WIDTH * 0.76, HEIGHT * 0.7)],
            fill=hex_to_rgb(COLORS["orange"]),
        )
        draw.ellipse(
            (WIDTH * 0.62, HEIGHT * 0.08, WIDTH * 0.9, HEIGHT * 0.42),
            fill=(127, 188, 222),
        )
    else:
        draw.rectangle((0, 0, WIDTH, HEIGHT), fill=hex_to_rgb(COLORS["blue_dark"]))
        draw.polygon(
            [(0, HEIGHT * 0.74), (0, HEIGHT * 0.12), (WIDTH * 0.46, 0), (WIDTH * 0.74, 0), (WIDTH * 0.3, HEIGHT)],
            fill=hex_to_rgb(COLORS["blue"]),
        )
        draw.polygon(
            [(WIDTH * 0.72, 0), (WIDTH, 0), (WIDTH, HEIGHT * 0.42), (WIDTH * 0.82, HEIGHT * 0.6)],
            fill=hex_to_rgb(COLORS["orange"]),
        )

    haze = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    haze_draw = ImageDraw.Draw(haze)
    haze_draw.ellipse(
        (WIDTH * 0.58, HEIGHT * 0.04, WIDTH * 0.96, HEIGHT * 0.48),
        fill=(255, 255, 255, 24),
    )
    haze_draw.polygon(
        [(WIDTH * 0.14, HEIGHT), (WIDTH * 0.34, HEIGHT * 0.52), (WIDTH * 0.52, HEIGHT), (0, HEIGHT)],
        fill=(255, 255, 255, 18),
    )
    return Image.alpha_composite(image.convert("RGBA"), haze).convert("RGB")


def hero_frame(slide, p):
    base = load_bg(slide.get("backgroundAsset", "hero-erp.png"))
    base = base.crop((0, 0, base.width, base.height))
    enhancer = ImageEnhance.Brightness(base)
    base = enhancer.enhance(0.65 + 0.1 * math.sin(math.pi * p))

    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rectangle((0, 0, WIDTH, HEIGHT), fill=(0, 20, 34, 150))
    overlay_draw.polygon([(1180, 0), (1600, 0), (1600, 460), (1380, 520)], fill=(237, 133, 77, 80))
    overlay_draw.polygon([(900, 0), (1220, 0), (960, 240), (720, 240)], fill=(127, 188, 222, 46))
    image = Image.alpha_composite(base.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(image)

    eyebrow_font = load_font(24, bold=True)
    title_font = load_font(78, bold=True)
    body_font = load_font(28)

    x_offset = int(40 * (1 - min(p * 1.8, 1)))
    opacity = int(255 * min(p * 1.5, 1))
    fill = (255, 255, 255, opacity)
    draw.text((96 - x_offset, 92), slide.get("eyebrow", "Kalpa slideshow tool").upper(), font=eyebrow_font, fill=fill)

    title_lines = wrap_text(draw, slide.get("title", "Kalpa slide"), title_font, 760)
    y = 168 - x_offset
    for line in title_lines:
        draw.text((96, y), line, font=title_font, fill=fill)
        y += 88

    subtitle_lines = wrap_text(draw, slide.get("subtitle", ""), body_font, 760)
    y += 12
    for line in subtitle_lines[:4]:
        draw.text((96, y), line, font=body_font, fill=(255, 255, 255, opacity - 30))
        y += 40

    button_box = (96, HEIGHT - 140, 360, HEIGHT - 82)
    rounded_panel(draw, button_box, fill=hex_to_rgb(COLORS["orange"]), radius=28)
    draw.text((126, HEIGHT - 126), slide.get("ctaText", "Generate deck"), font=load_font(24, bold=True), fill="white")
    return image.convert("RGB")


def challenge_frame(slide, p):
    image = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(COLORS["paper"]))
    draw = ImageDraw.Draw(image)
    title_font = load_font(52, bold=True)
    body_font = load_font(28)
    draw.text((104, 96), slide.get("sectionKicker", "Challenges").upper(), font=load_font(22, bold=True), fill=hex_to_rgb(COLORS["blue"]))
    title_lines = wrap_text(draw, slide.get("title", "Challenge stack"), title_font, 900)
    y = 140
    for line in title_lines[:2]:
        draw.text((104, y), line, font=title_font, fill=hex_to_rgb(COLORS["ink"]))
        y += 64

    cards = slide.get("cards", [])[:3]
    for idx, card in enumerate(cards):
        progress = max(0.0, min(1.0, p * 1.6 - idx * 0.12))
        offset = int((1 - progress) * 36)
        alpha = int(220 * progress)
        box = (104, 300 + idx * 142 + offset, 1490, 404 + idx * 142 + offset)
        rounded_panel(draw, box, fill=(255, 255, 255), outline=(0, 122, 190, 36), radius=28)
        chip_fill = (0, 122, 190, max(20, alpha // 4))
        chip = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        chip_draw = ImageDraw.Draw(chip)
        chip_draw.rounded_rectangle(box, radius=28, fill=chip_fill)
        image = Image.alpha_composite(image.convert("RGBA"), chip)
        draw = ImageDraw.Draw(image)
        draw.text((146, box[1] + 24), card, font=body_font, fill=hex_to_rgb(COLORS["blue_dark"]))
    return image.convert("RGB")


def stats_frame(slide, p):
    image = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(COLORS["surface"]))
    draw = ImageDraw.Draw(image)
    draw.text((96, 96), slide.get("sectionKicker", "Proof").upper(), font=load_font(22, bold=True), fill=hex_to_rgb(COLORS["blue"]))
    draw.text((96, 136), slide.get("title", "Key outcomes"), font=load_font(56, bold=True), fill=hex_to_rgb(COLORS["ink"]))
    stats = slide.get("stats", [])[:3]
    for idx, stat in enumerate(stats):
        box = (96 + idx * 490, 320, 520 + idx * 490, 610)
        rounded_panel(draw, box, fill=(246, 249, 252), outline=(0, 122, 190, 26), radius=28)
        pulse = 1.0 + 0.03 * math.sin((p + idx * 0.12) * math.tau)
        value = stat.get("value", "1")
        font = load_font(int(92 * pulse), bold=True)
        value_x = box[0] + 34
        draw.text((value_x, box[1] + 60), value, font=font, fill=hex_to_rgb(COLORS["blue_dark"]))
        draw.text((box[0] + 36, box[1] + 182), stat.get("label", "Metric"), font=load_font(28), fill=hex_to_rgb(COLORS["muted"]))
    return image


def roadmap_frame(slide, p):
    image = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(COLORS["surface"]))
    draw = ImageDraw.Draw(image)
    draw.text((96, 96), slide.get("sectionKicker", "Roadmap").upper(), font=load_font(22, bold=True), fill=hex_to_rgb(COLORS["blue"]))
    draw.text((96, 140), slide.get("title", "Project roadmap"), font=load_font(56, bold=True), fill=hex_to_rgb(COLORS["ink"]))
    steps = slide.get("steps", ["Clarify", "Structure", "Build", "Review"])[:4]
    line_y = 430
    max_width = int(1200 * min(p * 1.25, 1))
    draw.rounded_rectangle((140, line_y, 140 + max_width, line_y + 8), radius=4, fill=hex_to_rgb(COLORS["orange"]))
    for idx, step in enumerate(steps):
        x = 180 + idx * 360
        draw.ellipse((x - 16, line_y - 18, x + 16, line_y + 14), fill=hex_to_rgb(COLORS["orange"]))
        offset = int(24 * (1 - max(0.0, min(1.0, p * 1.4 - idx * 0.12))))
        draw.text((x - 48, line_y + 40 - offset), step, font=load_font(26, bold=True), fill=hex_to_rgb(COLORS["blue_dark"]))
    draw.text((96, 710), slide.get("closingReassurance", ""), font=load_font(28), fill=hex_to_rgb(COLORS["muted"]))
    return image


def grid_frame(slide, p):
    image = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(COLORS["paper"]))
    draw = ImageDraw.Draw(image)
    draw.text((96, 96), slide.get("sectionKicker", "Coverage").upper(), font=load_font(22, bold=True), fill=hex_to_rgb(COLORS["blue"]))
    draw.text((96, 140), slide.get("title", "Industry grid"), font=load_font(54, bold=True), fill=hex_to_rgb(COLORS["ink"]))
    cards = slide.get("cards", [])[:4]
    positions = [(96, 286), (810, 286), (96, 520), (810, 520)]
    for idx, label in enumerate(cards):
        x, y = positions[idx]
        progress = max(0.0, min(1.0, p * 1.8 - idx * 0.1))
        offset = int((1 - progress) * 28)
        box = (x, y + offset, x + 600, y + 176 + offset)
        rounded_panel(draw, box, fill=(255, 255, 255), outline=(0, 122, 190, 28), radius=26)
        draw.text((x + 34, y + 56 + offset), label, font=load_font(34, bold=True), fill=hex_to_rgb(COLORS["blue_dark"]))
    return image


def compare_frame(slide, p):
    image = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(COLORS["surface"]))
    draw = ImageDraw.Draw(image)
    draw.text((96, 96), slide.get("title", "Before and after"), font=load_font(56, bold=True), fill=hex_to_rgb(COLORS["ink"]))
    left_box = (96, 250, 760, 760)
    right_box = (840, 250, 1504, 760)
    rounded_panel(draw, left_box, fill=(248, 250, 252), outline=(0, 122, 190, 24), radius=28)
    rounded_panel(draw, right_box, fill=(255, 246, 239), outline=(237, 133, 77, 48), radius=28)
    draw.text((132, 290), slide.get("leftColumnTitle", "Current state"), font=load_font(34, bold=True), fill=hex_to_rgb(COLORS["blue_dark"]))
    draw.text((876, 290), slide.get("rightColumnTitle", "Outcome"), font=load_font(34, bold=True), fill=hex_to_rgb(COLORS["orange"]))
    for idx, point in enumerate(slide.get("leftColumnPoints", [])[:3]):
        draw.text((132, 360 + idx * 92), f"• {point}", font=load_font(28), fill=hex_to_rgb(COLORS["muted"]))
    for idx, point in enumerate(slide.get("rightColumnPoints", [])[:3]):
        rise = int((1 - min(max(0.0, p * 1.4 - idx * 0.1), 1.0)) * 18)
        draw.text((876, 360 + idx * 92 - rise), f"• {point}", font=load_font(28), fill=hex_to_rgb(COLORS["blue_dark"]))
    return image


def close_frame(slide, p):
    base = load_bg(slide.get("backgroundAsset", "hero-bg.png"))
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rectangle((0, 0, WIDTH, HEIGHT), fill=(0, 26, 41, 175))
    image = Image.alpha_composite(base.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(image)
    draw.text((96, 96), "CTA CLOSE", font=load_font(22, bold=True), fill=(255, 255, 255, 210))
    draw.text((96, 176), slide.get("title", "Ready?"), font=load_font(76, bold=True), fill="white")
    draw.text((96, 304), slide.get("subtitle", ""), font=load_font(30), fill=(255, 255, 255, 216))
    pulse = 1.0 + 0.02 * math.sin(math.tau * p)
    box = (96, 660, int(380 * pulse), 734)
    rounded_panel(draw, box, fill=hex_to_rgb(COLORS["orange"]), radius=34)
    draw.text((126, 679), slide.get("ctaText", "Download deck"), font=load_font(28, bold=True), fill="white")
    draw.text((96, 786), slide.get("contactLine", ""), font=load_font(24), fill=(255, 255, 255, 196))
    return image.convert("RGB")


def render_frame(slide, p):
    template = slide.get("templateId")
    if template == "kalpa-challenge-stack":
        return challenge_frame(slide, p)
    if template == "kalpa-proof-stats":
        return stats_frame(slide, p)
    if template == "kalpa-process-roadmap":
        return roadmap_frame(slide, p)
    if template == "kalpa-industry-grid":
        return grid_frame(slide, p)
    if template == "kalpa-offer-comparison":
        return compare_frame(slide, p)
    if template == "kalpa-cta-close":
        return close_frame(slide, p)
    return hero_frame(slide, p)


def main():
    spec_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    slide = json.loads(spec_path.read_text())
    duration_seconds = max(4, min(12, int(slide.get("durationSeconds", 8))))
    frame_count = duration_seconds * FPS

    frames = []
    for index in range(frame_count):
        progress = index / max(1, frame_count - 1)
        frame = render_frame(slide, progress)
        frames.append(frame)

    stem = slide["id"]
    png_path = output_dir / f"{stem}.png"
    gif_path = output_dir / f"{stem}.gif"
    mp4_path = output_dir / f"{stem}.mp4"

    frames[0].save(png_path)

    gif_frames = [
        frame.resize((GIF_WIDTH, GIF_HEIGHT)).quantize(colors=96)
        for frame in frames
    ]
    gif_frames[0].save(
        gif_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=int(1000 / FPS),
        loop=0,
        disposal=2,
    )

    mp4_frames = [np.array(frame.convert("RGB")) for frame in frames]
    writer = imageio.get_writer(mp4_path, fps=FPS, codec="libx264", quality=7, pixelformat="yuv420p")
    try:
        for frame in mp4_frames:
            writer.append_data(frame)
    finally:
        writer.close()


if __name__ == "__main__":
    main()
