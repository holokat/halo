import aiService, { DEFAULT_AI_MODEL } from '@/services/ai.service'
import storage from '@/services/local-storage.service'
import { TAIProviderConfig, TAIServiceConfig, TArticleSummary, TAIMessage } from '@/types'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useNostr } from '@/providers/NostrProvider'

type TAIContext = {
  serviceConfig: TAIServiceConfig
  updateServiceConfig: (config: TAIServiceConfig) => void
  summarizeArticle: (title: string, description: string, url: string) => Promise<TArticleSummary>
  chat: (messages: TAIMessage[], userPubkey?: string) => Promise<string>
  generateImage: (prompt: string) => Promise<string>
  getAvailableImageModels: () => Promise<Array<{ id: string; name: string }>>
  getAvailableWebSearchModels: () => Promise<Array<{ id: string; name: string }>>
  isConfigured: boolean
}

const AIContext = createContext<TAIContext | undefined>(undefined)

export const useAI = () => {
  const context = useContext(AIContext)
  if (!context) {
    throw new Error('useAI must be used within an AIProvider')
  }
  return context
}

export function AIProvider({ children }: { children: React.ReactNode }) {
  const { pubkey } = useNostr()
  const [serviceConfig, setServiceConfig] = useState<TAIServiceConfig>({
    provider: 'openrouter',
    model: DEFAULT_AI_MODEL,
    providerConfigs: {
      openrouter: {
        model: DEFAULT_AI_MODEL
      }
    }
  })

  const normalizeServiceConfig = useCallback((config: TAIServiceConfig): TAIServiceConfig => {
    const provider = config.provider || 'openrouter'
    const providerConfigs = { ...(config.providerConfigs ?? {}) }
    const currentProviderConfig: TAIProviderConfig = {
      apiKey: config.apiKey,
      model: config.model,
      imageModel: config.imageModel,
      webSearchModel: config.webSearchModel
    }
    const hasCurrentProviderValues = Object.values(currentProviderConfig).some(
      (value) => value !== undefined
    )

    providerConfigs[provider] = {
      ...(providerConfigs[provider] ?? {}),
      ...(hasCurrentProviderValues ? currentProviderConfig : {})
    }

    const activeProviderConfig = {
      ...(providerConfigs[provider] ?? {}),
      model: providerConfigs[provider]?.model || DEFAULT_AI_MODEL
    }

    providerConfigs[provider] = activeProviderConfig

    return {
      provider,
      apiKey: activeProviderConfig.apiKey ?? '',
      model: activeProviderConfig.model,
      imageModel: activeProviderConfig.imageModel ?? '',
      webSearchModel: activeProviderConfig.webSearchModel ?? '',
      providerConfigs
    }
  }, [])

  useEffect(() => {
    const savedServiceConfig = storage.getAIServiceConfig(pubkey)
    const normalizedServiceConfig = normalizeServiceConfig(savedServiceConfig)

    setServiceConfig(normalizedServiceConfig)

    aiService.setConfig(normalizedServiceConfig)

    if (JSON.stringify(savedServiceConfig) !== JSON.stringify(normalizedServiceConfig)) {
      storage.setAIServiceConfig(normalizedServiceConfig, pubkey)
    }
  }, [normalizeServiceConfig, pubkey])

  const updateServiceConfig = (config: TAIServiceConfig) => {
    const normalizedServiceConfig = normalizeServiceConfig(config)
    setServiceConfig(normalizedServiceConfig)
    storage.setAIServiceConfig(normalizedServiceConfig, pubkey)
    aiService.setConfig(normalizedServiceConfig)
  }

  const summarizeArticle = async (
    title: string,
    description: string,
    url: string
  ): Promise<TArticleSummary> => {
    return await aiService.summarizeArticle(title, description, url)
  }

  const chat = async (messages: TAIMessage[], userPubkey?: string): Promise<string> => {
    return await aiService.chat(messages, userPubkey)
  }

  const generateImage = async (prompt: string): Promise<string> => {
    return await aiService.generateImage(prompt)
  }

  const getAvailableImageModels = async (): Promise<Array<{ id: string; name: string }>> => {
    return await aiService.getAvailableImageModels()
  }

  const getAvailableWebSearchModels = async (): Promise<Array<{ id: string; name: string }>> => {
    return await aiService.getAvailableWebSearchModels()
  }

  const isConfigured = !!(serviceConfig.apiKey && serviceConfig.model)

  return (
    <AIContext.Provider
      value={{
        serviceConfig,
        updateServiceConfig,
        summarizeArticle,
        chat,
        generateImage,
        getAvailableImageModels,
        getAvailableWebSearchModels,
        isConfigured
      }}
    >
      {children}
    </AIContext.Provider>
  )
}
