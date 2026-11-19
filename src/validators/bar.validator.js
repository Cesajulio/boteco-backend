const { z } = require('zod');

const VALID_PRODUCTS = ['cerveja-600', 'agua-500', 'long-neck', 'caipirinha'];

const VALID_SORT_FIELDS = [
  'distance',
  'averageBeerPrice',
  'averageWaterPrice',
  'averageDrinkPrice',
  'averageRating',
  'name',
];

const barIdParamSchema = z.object({
  id: z.string().trim().min(1, 'O parâmetro id do bar é obrigatório.'),
});

const listOrNearbyBarsSchema = {
  query: z
    .object({
      lat: z.coerce
        .number()
        .min(-90, 'Latitude deve estar entre -90 e 90.')
        .max(90, 'Latitude deve estar entre -90 e 90.')
        .optional(),
      lng: z.coerce
        .number()
        .min(-180, 'Longitude deve estar entre -180 e 180.')
        .max(180, 'Longitude deve estar entre -180 e 180.')
        .optional(),
      radius: z.coerce
        .number()
        .positive('O raio deve ser maior que zero.')
        .max(500, 'O raio máximo permitido é 500 km.')
        .optional(),
      maxBeerPrice: z.coerce
        .number()
        .positive('maxBeerPrice deve ser um valor positivo.')
        .optional(),
      sortBy: z.enum(VALID_SORT_FIELDS).optional(),
      order: z.enum(['asc', 'desc']).optional().default('asc'),
      page: z.coerce.number().int().min(1, 'page deve ser >= 1.').optional().default(1),
      limit: z.coerce
        .number()
        .int()
        .min(1, 'limit deve ser >= 1.')
        .max(100, 'limit máximo é 100.')
        .optional()
        .default(20),
    })
    .superRefine((data, ctx) => {
      const geoCount = [data.lat, data.lng, data.radius].filter((v) => v !== undefined).length;
      if (geoCount > 0 && geoCount < 3) {
        ctx.addIssue({
          code: 'custom',
          path: ['lat'],
          message: 'Os parâmetros lat, lng e radius devem ser informados juntos para busca por proximidade.',
        });
      }
      if (data.sortBy === 'distance' && geoCount !== 3) {
        ctx.addIssue({
          code: 'custom',
          path: ['sortBy'],
          message: 'A ordenação por distância exige os parâmetros lat, lng e radius.',
        });
      }
    }),
};

const searchBarsSchema = {
  query: z.object({
    q: z.string().trim().min(1, 'O parâmetro q é obrigatório na querystring.').max(100),
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  }),
};

const rankingBarsSchema = {
  query: z.object({
    product: z.enum(VALID_PRODUCTS).optional().default('cerveja-600'),
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  }),
};

const getBarByIdSchema = {
  params: barIdParamSchema,
};

const createBarSchema = {
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'O nome do bar deve ter pelo menos 2 caracteres.')
      .max(120, 'O nome do bar deve ter no máximo 120 caracteres.'),
    address: z
      .string()
      .trim()
      .min(5, 'O endereço deve ter pelo menos 5 caracteres.')
      .max(250, 'O endereço deve ter no máximo 250 caracteres.'),
    latitude: z
      .number()
      .min(-90, 'Latitude deve estar entre -90 e 90.')
      .max(90, 'Latitude deve estar entre -90 e 90.'),
    longitude: z
      .number()
      .min(-180, 'Longitude deve estar entre -180 e 180.')
      .max(180, 'Longitude deve estar entre -180 e 180.'),
    phone: z.string().trim().max(30).optional(),
    openingHours: z.string().trim().max(120).optional(),
    averageBeerPrice: z.number().min(0).max(1000).optional().default(0),
    averageWaterPrice: z.number().min(0).max(1000).optional().default(0),
    averageDrinkPrice: z.number().min(0).max(1000).optional().default(0),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).optional().default([]),
  }),
};

const updateBarSchema = {
  params: barIdParamSchema,
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      address: z.string().trim().min(5).max(250).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      phone: z.string().trim().max(30).optional(),
      openingHours: z.string().trim().max(120).optional(),
      tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Informe ao menos um campo para atualização do bar.',
    }),
};

const updatePriceSchema = {
  params: barIdParamSchema,
  body: z.object({
    productId: z.enum(VALID_PRODUCTS, {
      message: `Produto não reconhecido. Valores aceitos: ${VALID_PRODUCTS.join(', ')}.`,
    }),
    price: z
      .number()
      .positive('O preço deve ser maior que zero.')
      .max(10000, 'O preço informado excede o limite permitido (R$ 10.000).'),
  }),
};

const priceHistoryQuerySchema = {
  params: barIdParamSchema,
  query: z.object({
    productId: z.enum(VALID_PRODUCTS).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  }),
};

const createReviewSchema = {
  params: barIdParamSchema,
  body: z.object({
    rating: z
      .number()
      .int('A nota deve ser um número inteiro.')
      .min(1, 'A nota mínima é 1.')
      .max(5, 'A nota máxima é 5.'),
    comment: z
      .string()
      .trim()
      .max(500, 'O comentário deve ter no máximo 500 caracteres.')
      .optional()
      .default(''),
  }),
};

const listReviewsSchema = {
  params: barIdParamSchema,
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  }),
};

module.exports = {
  VALID_PRODUCTS,
  VALID_SORT_FIELDS,
  listOrNearbyBarsSchema,
  searchBarsSchema,
  rankingBarsSchema,
  getBarByIdSchema,
  createBarSchema,
  updateBarSchema,
  updatePriceSchema,
  priceHistoryQuerySchema,
  createReviewSchema,
  listReviewsSchema,
};
