export type ApiEnvironment = {
  ALPHAVANTAGE_API_KEY?: string
}

export function handleApiRequest<TEnvironment extends object = ApiEnvironment>(
  request: Request,
  env?: TEnvironment
): Promise<Response>

export default function netlifyApiHandler(request: Request): Promise<Response>
