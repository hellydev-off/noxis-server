import { AppDataSource } from "../config/db";
import { User } from "../entities/User";

export class UserInventoryService {
  private userRepository = AppDataSource.getRepository(User);

  async selectSkin(userId: number, itemData: any) {
    // 1. Находим пользователя
    const user = await this.userRepository.findOne({
      where: { user_id: userId },
    });

    if (!user) {
      throw new Error(`Пользователь с ID ${userId} не найден`);
    }

    const skinIdToSelect = itemData.id;

    // 2. Обновляем инвентарь
    // Важно: создаем новый массив или мутируем текущий, если TypeORM поддерживает jsonb
    user.inventory = user.inventory.map((item: any) => {
      if (item.id === skinIdToSelect) {
        return { ...item, isActive: true };
      } else if (item.isActive) {
        // Выключаем предыдущий активный скин
        return { ...item, isActive: false };
      }
      return item;
    });

    // 3. Сохраняем изменения
    return await this.userRepository.save(user);
  }

  async getUserInventory(userId: number) {
    const user = await this.userRepository.findOne({
      where: { user_id: userId },
    });
    return user?.inventory || [];
  }
}
