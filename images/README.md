# 相册照片说明

将你自己的照片放入本目录，并保证文件名与 `script.js` 里 `CAROUSEL_PHOTOS` 的配置一致。

## 默认文件名

| 文件 | 说明 |
|------|------|
| `photo1.jpg` | 第 1 张轮播图 |
| `photo2.jpg` | 第 2 张轮播图 |

也支持 `.png`、`.webp`，只需在 `script.js` 中修改 `src` 路径。

## 修改 caption

打开项目根目录的 `script.js`，编辑 `CAROUSEL_PHOTOS` 数组里每一项的 `caption` 字段。

## 占位图

在放入真实照片前，页面会使用同名的 `.svg` 占位图（`photo1.svg` 等）。
