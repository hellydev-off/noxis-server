import { AppDataSource } from "../../config/db";
import { Market } from "../../entities/Market";
import { FileService } from "../../utils/FileService";

export class MarketService {
  private marketRepository = AppDataSource.getRepository(Market);

  async createItem(
    title: string,
    type: string,
    rarity: string,
    imageFile: any, // Теперь принимаем файл
    price: number,
    data: any,
  ) {
    const fileName = FileService.saveFile(imageFile);

    const item = this.marketRepository.create({
      title,
      type,
      rarity,
      imageUrl: `/static/${fileName}`,
      price,
      data,
    });

    return await this.marketRepository.save(item);
  }

  async findAll(type: string) {
    return await this.marketRepository.find({
      where: { type },
      order: { id: "DESC" }, // Свежие айтемы будут сверху
    });
  }
}
