#!/usr/bin/env python3
"""
将 eggs.png 和 chickens.png 的纯白背景改为金闪闪色，保存为 PNG。
依赖: pip install Pillow
"""

import math
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("请先安装 Pillow: pip install Pillow")
    raise

# 脚本所在目录
SCRIPT_DIR = Path(__file__).resolve().parent

# 输入 -> 输出文件名
IMAGES = [
    ("eggs.png", "eggs.png"),
    ("chickens.png", "chickens.png"),
]

# 视为“纯白背景”的 RGB 阈值，超过则替换为金闪闪 (0-255)
WHITE_THRESHOLD = 250

# 金闪闪基色 (R, G, B) — 饱和的金黄
GOLD_BASE = (255, 218, 90)

# 闪闪：按像素位置做轻微明暗变化，避免死板
SHIMMER_SCALE = 0.12
SHIMMER_FREQ = 0.04

# 抗锯齿：接近白色的像素按比例混合为金色
SMOOTH_EDGES = True


def rgba_white_to_yolk(img, white_thresh=WHITE_THRESHOLD, gold_base=GOLD_BASE, smooth=SMOOTH_EDGES):
    """将纯白/近白像素改为金闪闪色，返回 RGBA 新图。"""
    img = img.convert("RGBA")
    gr, gg, gb = gold_base
    w, h = img.size
    data = img.getdata()
    out = []
    for i, item in enumerate(data):
        r, g, b, a = item
        x, y = i % w, i // w
        shimmer = 1.0 + SHIMMER_SCALE * math.sin(x * SHIMMER_FREQ) * math.sin(y * SHIMMER_FREQ)
        sr = min(255, int(gr * shimmer))
        sg = min(255, int(gg * shimmer))
        sb = min(255, int(gb * shimmer))
        max_rgb = max(r, g, b)
        if max_rgb >= white_thresh:
            if smooth:
                t = (max_rgb - white_thresh) / (255 - white_thresh) if white_thresh < 255 else 1
                nr = int(r * (1 - t) + sr * t)
                ng = int(g * (1 - t) + sg * t)
                nb = int(b * (1 - t) + sb * t)
                out.append((nr, ng, nb, a))
            else:
                out.append((sr, sg, sb, a))
        else:
            out.append(item)
    img.putdata(out)
    return img


def main():
    for in_name, out_name in IMAGES:
        src = SCRIPT_DIR / in_name
        dst = SCRIPT_DIR / out_name
        if not src.exists():
            print(f"跳过（不存在）: {src}")
            continue
        print(f"处理: {src.name} -> {dst.name}")
        img = Image.open(src)
        img = rgba_white_to_yolk(img)
        img.save(dst, format="PNG")
        print(f"  已保存 PNG: {dst}")
    print("完成。")


if __name__ == "__main__":
    main()
