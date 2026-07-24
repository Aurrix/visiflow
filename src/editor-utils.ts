export const scaledContentHeight = (logicalWidth: number, imageWidth: number, imageHeight: number) =>
  Math.round(imageHeight * logicalWidth / imageWidth)
