const { z } = require('zod');

const loginSchema = {
  body: z.object({
    username: z
      .string()
      .trim()
      .min(3, 'O campo username deve ter pelo menos 3 caracteres.')
      .max(50, 'O campo username deve ter no máximo 50 caracteres.'),
    password: z
      .string()
      .min(4, 'O campo password deve ter pelo menos 4 caracteres.')
      .max(100, 'O campo password deve ter no máximo 100 caracteres.'),
  }),
};

const registerSchema = {
  body: z.object({
    username: z
      .string()
      .trim()
      .min(3, 'O username deve ter pelo menos 3 caracteres.')
      .max(50, 'O username deve ter no máximo 50 caracteres.')
      .regex(/^[a-zA-Z0-9_.-]+$/, 'O username deve conter apenas letras, números, ".", "_" ou "-".'),
    name: z
      .string()
      .trim()
      .min(2, 'O nome deve ter pelo menos 2 caracteres.')
      .max(100, 'O nome deve ter no máximo 100 caracteres.'),
    email: z
      .string()
      .trim()
      .email('Informe um e-mail válido.')
      .optional(),
    password: z
      .string()
      .min(6, 'A senha deve ter pelo menos 6 caracteres.')
      .max(100, 'A senha deve ter no máximo 100 caracteres.'),
  }),
};

const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(10, 'O campo refreshToken é obrigatório.'),
  }),
};

module.exports = {
  loginSchema,
  registerSchema,
  refreshSchema,
};
