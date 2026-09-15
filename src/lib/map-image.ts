/**
 * 주차 구역 도면 이미지 업로드 규칙.
 *
 * 파일은 DB(parking_areas.map_image_data)에 그대로 보관한다.
 * 별도 스토리지나 업로드 디렉터리를 두지 않아 권한·백업·배포 경로 문제가 생기지 않는다.
 */

export const MAP_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const MAP_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const;

export function isAllowedMapImageType(mimeType: string): boolean {
  return (MAP_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function mapImageTypeMessage(): string {
  return 'PNG, JPEG, WebP, GIF, SVG 파일만 올릴 수 있습니다.';
}

export function mapImageSizeMessage(): string {
  return `도면 파일은 ${Math.round(MAP_IMAGE_MAX_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있습니다.`;
}
