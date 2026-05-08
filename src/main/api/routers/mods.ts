import { z } from 'zod';

import Mods from '~main/modules/mods';
import { ModIdSchema } from '~common/mods';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const modsRouter = createTRPCRouter({
	list: publicProcedure.query(() => Mods.status),
	verify: publicProcedure.mutation(() => Mods.verify()),
	toggle: publicProcedure
		.input(z.object({ id: ModIdSchema, enabled: z.boolean() }))
		.mutation(({ input }) => Mods.toggle(input.id, input.enabled)),
	setIgnoreUpdates: publicProcedure
		.input(z.object({ id: ModIdSchema, ignore: z.boolean() }))
		.mutation(({ input }) => Mods.setIgnoreUpdates(input.id, input.ignore)),
	applyAll: publicProcedure.mutation(() => Mods.applyAll()),
	observe: publicProcedure.subscription(() => Mods.observe())
});
