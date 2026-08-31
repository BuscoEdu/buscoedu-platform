/**
 * Adaptador para el proveedor Abacus.AI (ChatLLM).
 *
 * Lee el deployment_id y el token EXCLUSIVAMENTE desde variables de entorno,
 * usando el NOMBRE de la variable almacenado en la base de datos
 * (despliegues_ia.identificador_externo y despliegues_ia.referencia_secreto).
 *
 * SEGURIDAD: nunca se hardcodean claves ni se almacenan valores de secretos
 * en la base de datos. Solo se guarda la referencia (el nombre de la variable).
 */

const ABACUS_ENDPOINT = 'https://api.abacus.ai/api/v0/getConversationResponse';

export interface ResultadoAdaptador {
  respuesta_texto: string;
  conversation_id_nuevo?: string;
}

export class AbacusAdapter {
  /**
   * Ejecuta una llamada conversacional contra Abacus.AI.
   *
   * @param prompt_sistema        Prompt de sistema construido desde los contextos.
   * @param mensaje_usuario       Mensaje escrito por el usuario final.
   * @param conversation_id       ID de conversación para mantener contexto (opcional).
   * @param identificador_externo Nombre de la variable de entorno del deployment_id.
   * @param referencia_secreto    Nombre de la variable de entorno del token.
   */
  async ejecutar(params: {
    prompt_sistema: string;
    mensaje_usuario: string;
    conversation_id?: string;
    identificador_externo: string;
    referencia_secreto: string;
  }): Promise<ResultadoAdaptador> {
    const deploymentId = process.env[params.identificador_externo];
    const deploymentToken = process.env[params.referencia_secreto];

    if (!deploymentId || !deploymentToken) {
      throw new Error(
        `Faltan variables de entorno del despliegue: ${params.identificador_externo} o ${params.referencia_secreto}`
      );
    }

    const reqBody: Record<string, unknown> = {
      deploymentId,
      deploymentToken,
      message: `${params.prompt_sistema}\n\nMensaje del estudiante: ${params.mensaje_usuario}`
    };

    if (params.conversation_id) {
      reqBody.deploymentConversationId = params.conversation_id;
    }

    const abacusRes = await fetch(ABACUS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    if (!abacusRes.ok) {
      throw new Error(`Abacus.AI respondió con estado ${abacusRes.status}`);
    }

    const data = await abacusRes.json();
    const result = data?.result ?? data;

    const conversationIdNuevo: string | undefined =
      result?.deploymentConversationId || result?.deployment_conversation_id || params.conversation_id;

    const messages = result?.messages;
    let textoBot = '';

    if (Array.isArray(messages) && messages.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        const esUsuario = m?.is_user ?? m?.isUser ?? false;
        if (!esUsuario) {
          textoBot = (m?.text ?? m?.content ?? '').toString();
          if (textoBot) break;
        }
      }
    }

    return {
      respuesta_texto: textoBot,
      conversation_id_nuevo: conversationIdNuevo
    };
  }
}
