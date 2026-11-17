# 编辑输入

`edit` 接受 1 到 16 张输入图片。本地路径支持 png、jpeg、webp，也可以传 `https://` URL。

```bash
image-generation edit \
  --prompt "让第二张的配色接近第一张" \
  --image ./reference.png \
  --image ./target.jpg
```

mask 和 markup 只作用于第一张输入图，不作用于后续图片，两者不能同时使用。多图编辑时，在提示词里按序号说明每张图的用途和组合方式，写法见 `prompting.md`。

## mask

mask 指定第一张输入图中需要编辑的区域。全透明像素（alpha 为 0）表示要编辑的地方，不透明区域表示保留。

制作步骤：

1. 以第一张输入图为基准。
2. 把需要修改的区域清为全透明。
3. 其余区域保持不透明。
4. 保存为 PNG，宽高与第一张输入图一致。
5. 通过 `--mask` 传入，并在提示词中说明该区域要发生的变化。

```bash
image-generation edit \
  --prompt "只把透明区域的墙改成浅灰色，保留家具、光线和构图不变" \
  --image ./room.png \
  --mask ./mask.png
```

要求：

- PNG，包含 alpha 通道或 `tRNS`。
- 宽高与第一张输入图一致，按 EXIF 方向校正后比较。
- 模型把 mask 当作提示，可能不会严格遵循精确形状。

## markup

markup 用圆圈、线条或框选标出要修改的位置。标注层单独保存，不要压平到原图。

制作步骤：

1. 保留原图作为第一张输入图片。
2. 新建与第一张图同宽高的透明 PNG，只在上面绘制标注。
3. 通过 `--markup` 传入标注层。
4. 在提示词中说明要改什么、要保留什么，并要求完成后去掉标注。

```bash
image-generation edit \
  --prompt "把红色圆圈里的花瓶改成钴蓝色陶瓷，保留花瓶形状、干花、桌面和厨房光线；完成后去掉红色圆圈" \
  --image ./kitchen.png \
  --markup ./overlay.png
```

要求：

- PNG，包含透明像素。
- 标注层与第一张图在方向校正后宽高一致。
- 第一张输入图和标注层各不超过 16,777,216 像素。
- markup 需要模型支持。CLI 不按模型名拦截，是否可用以服务端支持情况为准；OpenAI GPT Image 2.5/2.6 已支持。

## 共同限制

- 本地 mask 和 markup 必须是 PNG。
- 本地 mask 和 markup 的宽高必须与第一张输入图一致。本地文件在调用 API 前预检 PNG 格式、alpha 通道和尺寸；HTTPS 输入和透明像素的最终判断由 API 完成。
- 每个 `image_url`，包括 mask 和 markup，不超过 20,971,520 字符。本地单文件约 15MB，所有输入共用这个上限。
- HTTPS 形式的 mask 或 markup 由 API 校验。
