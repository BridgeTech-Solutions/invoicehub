import { Controller, Get, Query, Request } from '@nestjs/common';
import { z } from 'zod';
import { Permission } from '../../common/decorators/permission.decorator';
import { SearchService } from './search.service';
import { AppError } from '../../common/errors/app-error';

const searchSchema = z.object({
  q:     z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

@Controller('search')
@Permission('search:read')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query() query: Record<string, unknown>, @Request() req: any) {
    const parsed = searchSchema.safeParse(query);
    if (!parsed.success) throw AppError.badRequest('Paramètre q requis (1-200 caractères)');
    const { q, limit } = parsed.data;
    const isAdmin = req.user?.roleName === 'admin';
    return this.searchService.search(q, limit, isAdmin);
  }
}
