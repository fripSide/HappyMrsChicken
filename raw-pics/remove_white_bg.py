#!/usr/bin/env python3
"""
将 eggs.png 和 chiken.png 的白色背景变为透明，保存为 PNG。
依赖: pip install Pillow
"""

from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("请先安装 Pillow: pip install Pillow")
    raise

# 脚本所在目录
SCRIPT_DIR = Path(__file__).resolve().parent

# 输入 -> 输出文件名（同名即覆盖原图，游戏会继续用 eggs.png / chiken.png）
IMAGES = [
    ("raw-pics/eggs.png", "eggs.png"),
    ("raw-pics/chickens.png", "chickens.png"),
]

# 视为“白色”的 RGB 阈值，超过则变透明 (0-255)
WHITE_THRESHOLD = 250

# 抗锯齿：接近白色的像素按比例设透明度 (True 推荐)
SMOOTH_EDGES = True


def rgba_without_white(img, white_thresh=WHITE_THRESHOLD, smooth=SMOOTH_EDGES):
    """将白色/近白像素变为透明，返回 RGBA 新图。"""
    img = img.convert("RGBA")
    data = img.getdata()
    out = []
    for item in data:
        r, g, b, a = item
        if smooth:
            # 按“最白”通道计算保留的不透明度，使边缘平滑
            max_rgb = max(r, g, b)
            if max_rgb >= white_thresh:
                # 白色到接近白：线性过渡到完全透明
                t = (max_rgb - white_thresh) / (255 - white_thresh) if white_thresh < 255 else 1
                new_alpha = int(a * (1 - t))
            else:
                new_alpha = a
            out.append((r, g, b, new_alpha))
        else:
            if r >= white_thresh and g >= white_thresh and b >= white_thresh:
                out.append((r, g, b, 0))
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
        img = rgba_without_white(img)
        img.save(dst, "PNG")
        print(f"  已保存: {dst}")
    print("完成。")


if __name__ == "__main__":
    main()
