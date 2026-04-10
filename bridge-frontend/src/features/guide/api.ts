import apiClient from '@/lib/api-client'

/** Map section → chemin relatif de la vidéo (ex: "uploads/videos/facturation.mp4") */
export type GuideVideos = Record<string, string>

export const guideApi = {
  /** GET /guide/videos — retourne les sections qui ont une vidéo */
  async listVideos(): Promise<GuideVideos> {
    const { data } = await apiClient.get<GuideVideos>('/guide/videos')
    return data
  },

  /** POST /guide/videos/:section — upload une vidéo (admin) */
  async uploadVideo(
    section: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<{ path: string; section: string }> {
    const form = new FormData()
    form.append('file', file)
    const { data } = await apiClient.post<{ path: string; section: string }>(
      `/guide/videos/${section}`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
        },
      },
    )
    return data
  },

  /** DELETE /guide/videos/:section — supprime la vidéo (admin) */
  async deleteVideo(section: string): Promise<void> {
    await apiClient.delete(`/guide/videos/${section}`)
  },
}
