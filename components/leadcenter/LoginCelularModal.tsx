'use client';

import VerificacionCelularModal, { VerificacionExitosa } from './VerificacionCelularModal';

interface Props {
  onAutenticado: (data: VerificacionExitosa) => void;
  onCerrar: () => void;
}

/**
 * Inicio de sesión de la persona (estudiante) por celular + OTP.
 * Reutiliza el modal de verificación con propósito 'login'.
 */
export default function LoginCelularModal({ onAutenticado, onCerrar }: Props) {
  return (
    <VerificacionCelularModal
      proposito="login"
      titulo="Ingresa con tu celular"
      descripcion="Te enviaremos un código de verificación para confirmar que eres tú."
      onVerificado={onAutenticado}
      onCerrar={onCerrar}
    />
  );
}
