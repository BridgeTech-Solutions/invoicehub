import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { guideApi } from './api'

export function useGuideVideos() {
  return useQuery({
    queryKey: ['guide-videos'],
    queryFn:  guideApi.listVideos,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUploadGuideVideo(section: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (pct: number) => void }) =>
      guideApi.uploadVideo(section, file, onProgress),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guide-videos'] }),
  })
}

export function useDeleteGuideVideo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (section: string) => guideApi.deleteVideo(section),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guide-videos'] }),
  })
}
