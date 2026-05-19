import {
  Controller, Get, Post, Delete, Param,
  UploadedFile, UseInterceptors, BadRequestException,
  NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GuideService, VALID_SECTIONS } from './guide.service';
import { Permission } from '../../common/decorators/permission.decorator';

const ACCEPTED_MIMES = ['video/mp4', 'video/webm', 'video/ogg'];

@ApiTags('Guide')
@ApiBearerAuth()
@Controller('guide')
export class GuideController implements OnModuleInit {
  constructor(private readonly svc: GuideService) {}

  onModuleInit() {
    this.svc.ensureDir();
  }

  @Get('videos')
  @Permission('settings:read')
  listVideos() {
    return this.svc.listVideos();
  }

  @Post('videos/:section')
  @Permission('settings:update')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits:  { fileSize: 500 * 1024 * 1024 },
  }))
  async uploadVideo(
    @Param('section') section: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!VALID_SECTIONS.has(section)) {
      throw new BadRequestException(`Section inconnue : ${section}`);
    }
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu');
    }
    if (!ACCEPTED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException('Format non accepté. Utilisez MP4, WebM ou OGG.');
    }
    const relativePath = await this.svc.saveVideo(section, file.buffer, file.originalname);
    return { path: relativePath, section };
  }

  @Delete('videos/:section')
  @Permission('settings:update')
  async deleteVideo(@Param('section') section: string) {
    if (!VALID_SECTIONS.has(section)) {
      throw new BadRequestException(`Section inconnue : ${section}`);
    }
    if (!this.svc.findVideoFile(section)) {
      throw new NotFoundException('Aucune vidéo trouvée pour cette section');
    }
    await this.svc.deleteVideo(section);
    return { success: true };
  }
}
