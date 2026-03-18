import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { useAI } from '@/providers/AIProvider'
import { TAIProvider, TAIProviderConfig, TAIServiceConfig } from '@/types'
import aiService, { DEFAULT_AI_MODEL } from '@/services/ai.service'
import { Check, Eye, EyeOff } from 'lucide-react'
import { forwardRef, useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const AIToolsPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const { serviceConfig, updateServiceConfig, getAvailableImageModels, getAvailableWebSearchModels } = useAI()
  const [selectedProvider, setSelectedProvider] = useState<TAIProvider>(serviceConfig.provider || 'openrouter')
  const [apiKey, setApiKey] = useState(serviceConfig.apiKey || '')
  const [selectedModel, setSelectedModel] = useState(serviceConfig.model || DEFAULT_AI_MODEL)
  const [selectedImageModel, setSelectedImageModel] = useState(serviceConfig.imageModel || '')
  const [selectedWebSearchModel, setSelectedWebSearchModel] = useState(serviceConfig.webSearchModel || '')
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([])
  const [availableImageModels, setAvailableImageModels] = useState<Array<{ id: string; name: string }>>([])
  const [availableWebSearchModels, setAvailableWebSearchModels] = useState<Array<{ id: string; name: string }>>([])
  const [showApiKey, setShowApiKey] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationRequestRef = useRef(0)

  const loadModels = useCallback(async () => {
    try {
      const models = await aiService.getAvailableModels()
      setAvailableModels(models)
    } catch (error) {
      console.error('Failed to load models:', error)
    }
  }, [])

  const loadImageModels = useCallback(async () => {
    try {
      const models = await getAvailableImageModels()
      setAvailableImageModels(models)
    } catch (error) {
      console.error('Failed to load image models:', error)
    }
  }, [getAvailableImageModels])

  const loadWebSearchModels = useCallback(async () => {
    try {
      const models = await getAvailableWebSearchModels()
      setAvailableWebSearchModels(models)
    } catch (error) {
      console.error('Failed to load web search models:', error)
    }
  }, [getAvailableWebSearchModels])

  useEffect(() => {
    void loadModels()
    void loadImageModels()
    void loadWebSearchModels()
  }, [loadImageModels, loadModels, loadWebSearchModels])

  useEffect(() => {
    setSelectedProvider(serviceConfig.provider || 'openrouter')
    setApiKey(serviceConfig.apiKey || '')
    setSelectedModel(serviceConfig.model || DEFAULT_AI_MODEL)
    setSelectedImageModel(serviceConfig.imageModel || '')
    setSelectedWebSearchModel(serviceConfig.webSearchModel || '')
  }, [serviceConfig])

  const buildServiceConfig = useCallback(
    (
      provider: TAIProvider,
      updates: Partial<TAIProviderConfig> = {}
    ): TAIServiceConfig => {
      const nextProviderConfig = {
        ...(serviceConfig.providerConfigs?.[provider] ?? {}),
        ...updates
      }

      if (!nextProviderConfig.model) {
        nextProviderConfig.model = DEFAULT_AI_MODEL
      }

      return {
        ...serviceConfig,
        provider,
        apiKey: nextProviderConfig.apiKey ?? '',
        model: nextProviderConfig.model,
        imageModel: nextProviderConfig.imageModel ?? '',
        webSearchModel: nextProviderConfig.webSearchModel ?? '',
        providerConfigs: {
          ...(serviceConfig.providerConfigs ?? {}),
          [provider]: nextProviderConfig
        }
      }
    },
    [serviceConfig]
  )

  const persistProviderConfig = useCallback(
    (
      provider: TAIProvider,
      updates: Partial<TAIProviderConfig> = {}
    ) => {
      updateServiceConfig(buildServiceConfig(provider, updates))
    },
    [buildServiceConfig, updateServiceConfig]
  )

  const handleProviderSelect = (provider: TAIProvider) => {
    if (provider === selectedProvider) return

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    validationRequestRef.current += 1

    const nextConfig = buildServiceConfig(provider)
    setSelectedProvider(provider)
    setApiKey(nextConfig.apiKey || '')
    setSelectedModel(nextConfig.model || DEFAULT_AI_MODEL)
    setSelectedImageModel(nextConfig.imageModel || '')
    setSelectedWebSearchModel(nextConfig.webSearchModel || '')
    updateServiceConfig(nextConfig)
  }

  const validateApiKey = useCallback(async (
    provider: TAIProvider,
    key: string,
    requestId: number
  ) => {
    const normalizedKey = key.trim()

    if (!normalizedKey) {
      return
    }

    const tempConfig = buildServiceConfig(provider, { apiKey: normalizedKey })
    const connectionStatus = await aiService.testConnection(tempConfig)

    if (requestId !== validationRequestRef.current) {
      return
    }

    if (connectionStatus === 'valid') {
      toast.success(t('API key saved successfully'))
      return
    }

    if (connectionStatus === 'invalid') {
      toast.error(t('API key was saved, but the provider rejected it. Please double-check the key.'))
      return
    }

    toast(t('API key was saved, but we could not verify it right now.'))
  }, [buildServiceConfig, t])

  const handleApiKeyChange = useCallback((value: string) => {
    setApiKey(value)
    persistProviderConfig(selectedProvider, { apiKey: value.trim() })
    validationRequestRef.current += 1
    const requestId = validationRequestRef.current

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    if (!value.trim()) {
      saveTimeoutRef.current = null
      return
    }

    // Verify in the background after the user pauses typing.
    saveTimeoutRef.current = setTimeout(() => {
      void validateApiKey(selectedProvider, value, requestId)
    }, 1000)
  }, [persistProviderConfig, selectedProvider, validateApiKey])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      validationRequestRef.current += 1
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId)
    updateServiceConfig(buildServiceConfig(selectedProvider, { model: modelId }))
    toast.success(t('Default model selected successfully'))
  }

  const handleImageModelSelect = (modelId: string) => {
    setSelectedImageModel(modelId)
    updateServiceConfig(buildServiceConfig(selectedProvider, { imageModel: modelId }))
    toast.success(t('Image model selected successfully'))
  }

  const handleWebSearchModelSelect = (modelId: string) => {
    setSelectedWebSearchModel(modelId)
    updateServiceConfig(buildServiceConfig(selectedProvider, { webSearchModel: modelId }))
    toast.success(t('Web search model selected successfully'))
  }

  const getProviderInfo = (provider: TAIProvider) => {
    switch (provider) {
      case 'openrouter':
        return {
          name: 'OpenRouter',
          description: 'Access to multiple AI models through a unified API',
          apiKeyUrl: 'https://openrouter.ai/keys'
        }
      case 'ppq':
        return {
          name: 'PPQ.ai',
          description: 'Pay with bitcoin and lightning',
          apiKeyUrl: 'https://ppq.ai'
        }
      default:
        return {
          name: 'Unknown',
          description: '',
          apiKeyUrl: ''
        }
    }
  }

  const providerInfo = getProviderInfo(selectedProvider)

  return (
    <SecondaryPageLayout ref={ref} index={index} title={t('AI Tools')}>
      <div className="px-4 pt-3 space-y-6">
        {/* Provider Selection */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{t('AI Provider')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('Select your AI service provider')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OpenRouter Card */}
            <Card
              className={cn(
                'cursor-pointer transition-all hover:border-primary/50',
                selectedProvider === 'openrouter' && 'border-primary ring-2 ring-primary/20'
              )}
              onClick={() => handleProviderSelect('openrouter')}
            >
              <CardHeader className="pb-3 pt-4">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">OpenRouter</CardTitle>
                  {selectedProvider === 'openrouter' && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
                <CardDescription className="text-xs">
                  Access to multiple AI models through a unified API
                </CardDescription>
              </CardHeader>
            </Card>

            {/* PPQ.ai Card */}
            <Card
              className={cn(
                'cursor-pointer transition-all hover:border-primary/50',
                selectedProvider === 'ppq' && 'border-primary ring-2 ring-primary/20'
              )}
              onClick={() => handleProviderSelect('ppq')}
            >
              <CardHeader className="pb-3 pt-4">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">PPQ.ai</CardTitle>
                  {selectedProvider === 'ppq' && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
                <CardDescription className="text-xs">
                  Pay with bitcoin and lightning
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Provider Configuration */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{providerInfo.name} {t('Configuration')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('Configure your API credentials and preferences')}
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="api-key">{t('API Key')}</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showApiKey ? 'text' : 'password'}
                placeholder={t('Enter your API key')}
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {providerInfo.apiKeyUrl && (
              <p className="text-xs text-muted-foreground">
                {t('Get your API key from')}{' '}
                <a
                  href={providerInfo.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {providerInfo.apiKeyUrl.replace('https://', '')}
                </a>
              </p>
            )}
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label htmlFor="model-select">{t('Default Model')}</Label>
            <Select
              value={selectedModel}
              onValueChange={handleModelSelect}
              disabled={availableModels.length === 0}
            >
              <SelectTrigger id="model-select">
                <SelectValue
                  placeholder={
                    availableModels.length === 0
                      ? t('No models available')
                      : t('Select a model')
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {availableModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableModels.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('Model for text generation, summaries, and general AI tasks. Use /ai command to access.')}
              </p>
            )}
          </div>

          {/* Image Model Selection */}
          <div className="space-y-2">
            <Label htmlFor="image-model-select">{t('Image Generation Model')}</Label>
            <Select
              value={selectedImageModel}
              onValueChange={handleImageModelSelect}
              disabled={availableImageModels.length === 0}
            >
              <SelectTrigger id="image-model-select">
                <SelectValue
                  placeholder={
                    availableImageModels.length === 0
                      ? t('No image models available')
                      : t('Select an image model')
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {availableImageModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableImageModels.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('Model used for image generation. Use /image command to access.')}
              </p>
            )}
          </div>

          {/* Web Search Model Selection */}
          <div className="space-y-2">
            <Label htmlFor="web-search-model-select">{t('Web Search Model')}</Label>
            <Select
              value={selectedWebSearchModel}
              onValueChange={handleWebSearchModelSelect}
              disabled={availableWebSearchModels.length === 0}
            >
              <SelectTrigger id="web-search-model-select">
                <SelectValue
                  placeholder={
                    availableWebSearchModels.length === 0
                      ? t('No web search models available')
                      : t('Select a web search model')
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {availableWebSearchModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableWebSearchModels.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('Model used for web searches and real-time information. Use /web command to access.')}
              </p>
            )}
          </div>
        </div>


      </div>
    </SecondaryPageLayout>
  )
})
AIToolsPage.displayName = 'AIToolsPage'
export default AIToolsPage
