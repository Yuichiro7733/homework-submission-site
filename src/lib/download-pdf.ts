import { jsPDF } from 'jspdf'

type PreparedImage = {
  dataUrl: string
  width: number
  height: number
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('画像を読み込めませんでした。'))
  reader.readAsDataURL(blob)
})

const imageDimensions = (dataUrl: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
  image.onerror = () => reject(new Error('画像のサイズを確認できませんでした。'))
  image.src = dataUrl
})

const prepareImage = async (url: string): Promise<PreparedImage> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('画像を取得できませんでした。')
  const dataUrl = await blobToDataUrl(await response.blob())
  const dimensions = await imageDimensions(dataUrl)
  return { dataUrl, ...dimensions }
}

export const downloadImagesAsPdf = async (urls: string[], fileName: string) => {
  const images = await Promise.all(urls.map(prepareImage))
  if (images.length === 0) throw new Error('PDFにする画像がありません。')

  const firstOrientation = images[0].width > images[0].height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation: firstOrientation, unit: 'mm', format: 'a4', compress: true })

  images.forEach((image, index) => {
    const orientation = image.width > image.height ? 'landscape' : 'portrait'
    if (index > 0) pdf.addPage('a4', orientation)

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 10
    const scale = Math.min(
      (pageWidth - margin * 2) / image.width,
      (pageHeight - margin * 2) / image.height,
    )
    const imageWidth = image.width * scale
    const imageHeight = image.height * scale
    const x = (pageWidth - imageWidth) / 2
    const y = (pageHeight - imageHeight) / 2

    pdf.addImage(image.dataUrl, 'JPEG', x, y, imageWidth, imageHeight, undefined, 'FAST')
  })

  pdf.save(fileName)
}
