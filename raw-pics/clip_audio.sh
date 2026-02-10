ffmpeg -i egg.wav -codec:a libmp3lame -q:a 2 egg.mp3
# 保留 egg.mp3 第 2–4 秒，去掉第 1 秒
ffmpeg -y -i egg.mp3 -ss 2 -t 2 -c:a copy egg_trimmed.mp3 && mv egg_trimmed.mp3 egg.mp3
# chick 实为 AAC，不能 -c copy 到 mp3，需重新编码并截取前 3 秒
ffmpeg -i chick.mp3 -t 3 -c:a libmp3lame -q:a 2 chick_3s.mp3