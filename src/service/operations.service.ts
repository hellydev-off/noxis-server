import { AppDataSource } from "../config/db";
import { User } from "../entities/User";

export class OperationsService {
  private userRepository = AppDataSource.getRepository(User);

  async addItemToInventory(userId: number, itemData: any) {
    // Находим пользователя
    const user = await this.userRepository.findOne({
      where: { user_id: userId },
    });

    if (!user) {
      throw new Error(`Пользователь с ID ${userId} не найден`);
    }

    // Безопасно работаем с массивом: если inventory null/undefined, создаем пустой массив
    const currentInventory = Array.isArray(user.inventory)
      ? user.inventory
      : [];

    user.inventory = [...currentInventory, { ...itemData, isActive: false }];

    // Сохраняем обратно в БД
    return await this.userRepository.save(user);
  }

  async getUserInventory(userId: number) {
    const user = await this.userRepository.findOne({
      where: { user_id: userId },
    });
    return user?.inventory || [];
  }
}
