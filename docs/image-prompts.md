# 菜单图片生成记录

使用内置 image_gen 工具生成，未使用 CLI/API key。最终素材位于 `miniprogram/assets/menu/`，导出为最长边 640px 的 JPEG 以减小小程序包体积。图片为 AI 生成的 Demo 展示图，不代表门店实物。

公共提示词：

Use case: product-mockup. Asset type: square food photograph for a Chinese barbecue restaurant mini program menu. Premium authentic restaurant food photography, close three-quarter overhead angle, food centered and fills frame, warm directional natural light, appetizing realistic textures, charcoal brown tabletop, muted background, no people, no text, no watermark, no collage, square composition. Save as a project food asset.

六款主体提示词：

- `lamb.jpg`: Chinese cumin lamb skewers, juicy small cubes of lamb on five bamboo skewers, toasted cumin and chili, dark ceramic plate
- `wings.jpg`: Chinese charcoal grilled chicken wings, four golden blistered chicken wings, sesame and chili, dark ceramic plate
- `eggplant.jpg`: Chinese grilled eggplant split lengthwise topped with chopped garlic, spring onions and red chili, dark ceramic plate
- `mushroom.jpg`: Chinese grilled king oyster mushroom skewers, browned mushroom slices on bamboo skewers, dark ceramic plate
- `lemon.jpg`: a chilled clear glass of freshly made lemon tea with lemon slices and ice, condensation, no branding
- `plum.jpg`: Use case: product-mockup. Asset type: square food photograph for a Chinese barbecue restaurant mini program menu. Subject: chilled Chinese sour plum juice, deep ruby amber liquid in a short clear tumbler with ice, a tiny dried osmanthus garnish, condensation. Premium authentic restaurant food photography, close three-quarter overhead angle, drink centered and fills frame, warm directional natural light, charcoal brown tabletop, muted background, no people, no text, no watermark, no collage, square composition.

## 纸质菜单全量配图（2026-11-01）

使用内置 image_gen，为每一道菜分别调用生成，共 52 张独立图片。花生、毛豆拆分展示；酒水保留原有两款演示饮品，价格沿用原项目。餐具和餐巾纸不属于菜品，未纳入本次配图。所有配图为 AI 展示图，不代表实物。

最终素材：`miniprogram/assets/menu/*-menu.jpg`，320px JPEG、质量 35，原有图片原稿备份至 `docs/original-menu-images/`。压缩脚本：`scripts/prepare-menu-images.py`；原图映射：`scripts/generated-images.json`。

公共提示词：

```text
Use case: product-mockup. Asset type: individual square food photograph for a Chinese barbecue restaurant mini program. Premium authentic photorealistic food photography matching an existing series: charcoal-black rustic ceramic plate on dark brown wooden tabletop, close three-quarter overhead angle, warm directional light from upper left, centered food fills frame, realistic appetizing texture, muted blurred background. No people, no text, no watermark, no collage. Subject: <subject>. One finished restaurant dish only.
```

主体提示词：

- `pork-menu.jpg`（猪肉）：five bamboo skewers of grilled pork cubes
- `pork-belly-menu.jpg`（带皮五花肉）：five skewers of skin-on pork belly slices with clear fat and lean layers
- `lamb-menu.jpg`（羊肉）：five bamboo skewers of cumin grilled lamb cubes
- `beef-menu.jpg`（牛肉）：five skewers of grilled lean beef cubes
- `beef-tendon-menu.jpg`（牛板筋）：skewers of flat chewy golden beef ligament slices
- `beef-mini-menu.jpg`（牛肉小串）：a large bundle of tiny Chinese beef skewers
- `beef-brisket-menu.jpg`（牛胸口）：skewers of golden translucent grilled beef brisket fat
- `beef-heart-tube-menu.jpg`（牛心管）：skewers of grilled hollow beef aorta tubes cut into short rings
- `beef-sinew-menu.jpg`（牛肉筋）：skewers of grilled beef meat alternating with chewy sinew
- `pork-cartilage-menu.jpg`（猪脆骨）：skewers of bite sized pork cartilage with meat
- `garlic-pork-menu.jpg`（蒜瓣肉）：skewers of grilled pork chunks alternating with whole garlic cloves
- `gizzard-menu.jpg`（鸡胗）：skewers of sliced grilled chicken gizzards
- `chicken-heart-menu.jpg`（鸡心）：skewers of small grilled chicken hearts
- `wings-menu.jpg`（奥尔良翅中）：two orange-red New Orleans style glazed grilled middle chicken wings on a skewer
- `lamb-kidney-menu.jpg`（羊腰）：grilled lamb kidneys cut open on bamboo skewers
- `lamb-testicle-menu.jpg`（羊宝）：fully cooked grilled lamb testicle slices on bamboo skewers, appetizing restaurant presentation
- `shrimp-menu.jpg`（大虾）：whole grilled shell-on large shrimp on bamboo skewers
- `squid-menu.jpg`（鱿鱼）：a whole grilled squid opened flat on bamboo skewers with tentacles
- `yellow-croaker-menu.jpg`（黄花鱼）：small whole grilled yellow croaker fish on skewers
- `capelin-menu.jpg`（多春鱼）：five small whole golden grilled capelin fish
- `halfbeak-menu.jpg`（马步鱼）：grilled butterflied long slender halfbeak fish fillets on skewers
- `gluten-menu.jpg`（面筋）：spiral wheat gluten cylinders on bamboo skewers, grilled chili cumin crust
- `fish-tofu-menu.jpg`（包心鱼豆腐）：golden stuffed fish tofu cubes on bamboo skewers, one cut open showing filling
- `tofu-menu.jpg`（千页豆腐）：skewers of thick rectangular grilled tofu slices with golden edges
- `sausage-menu.jpg`（烤肠）：grilled reddish sausages on skewers with diagonal cuts
- `bread-menu.jpg`（网红大面包）：thick large golden grilled bread slices on bamboo skewers
- `pork-fat-menu.jpg`（网红大油边）：Chinese Dongbei grilled pork skirt fat strips on skewers, crispy amber edges
- `whole-fish-menu.jpg`（烤鱼）：whole butterflied grilled fish in a rectangular black shallow pan, chili broth and four vegetable accompaniments cabbage potato bean sprouts and tofu
- `cabbage-menu.jpg`（甘蓝）：folded green cabbage leaves grilled on bamboo skewers
- `mushroom-menu.jpg`（蘑菇）：grilled king oyster mushroom slices on bamboo skewers
- `pepper-menu.jpg`（尖椒）：whole long green peppers on skewers with blistered charred skin
- `potato-menu.jpg`（土豆片）：thin round golden grilled potato slices on skewers
- `chives-menu.jpg`（韭菜）：a neatly arranged serving of long grilled green garlic chives
- `eggplant-menu.jpg`（茄子）：grilled eggplant chunks on bamboo skewers, purple skin visible
- `zucchini-menu.jpg`（西葫芦）：grilled zucchini half moon slices on skewers
- `cilantro-tofu-menu.jpg`（香菜豆腐）：Chinese home style tofu cubes cooked with fresh cilantro in light savory sauce
- `sour-potato-menu.jpg`（酸辣土豆丝）：stir fried finely julienned potatoes with red chili and green pepper strips
- `fried-fish-menu.jpg`（香煎青鱼）：golden pan fried Chinese black carp fish steaks
- `sweet-tomato-menu.jpg`（糖拌西红柿）：fresh red tomato wedges sprinkled visibly with white sugar
- `spicy-clams-menu.jpg`（辣炒花蛤）：stir fried clams in shells with dried red chili and spring onion
- `cucumber-menu.jpg`（爽口黄瓜）：Chinese smashed cucumber salad with garlic and red chili
- `tofu-skin-menu.jpg`（凉拌豆腐皮）：cold salad of thin shredded tofu skin with cilantro and chili
- `foil-enoki-menu.jpg`（锡纸金针菇）：enoki mushrooms with garlic chili sauce in an open aluminum foil tray
- `foil-cabbage-menu.jpg`（锡纸娃娃菜）：baby napa cabbage with garlic chili sauce in an open aluminum foil tray
- `foil-vermicelli-menu.jpg`（锡纸粉丝）：translucent glass noodles with garlic and scallions in an open aluminum foil tray
- `foil-noodles-menu.jpg`（锡纸方便面）：cooked curly instant noodles with chili broth and scallions in an open aluminum foil tray
- `foil-clams-menu.jpg`（锡纸花蛤）：cooked open clam shells in garlic broth in an open aluminum foil tray
- `scallops-menu.jpg`（粉丝扇贝）：scallops on half shells topped with glass noodles garlic and scallions
- `flatbread-menu.jpg`（淄博小饼）：a small stack of thin round soft Zibo barbecue flatbreads
- `scallion-sauce-menu.jpg`（葱酱）：fresh scallion stalks beside a small bowl of Chinese sweet bean sauce
- `peanuts-menu.jpg`（花生）：Chinese boiled shell-on peanuts piled on a dark ceramic plate
- `edamame-menu.jpg`（毛豆）：Chinese boiled green edamame pods piled on a dark ceramic plate

猪肉首张使用的提示词：

```text
Use case: product-mockup. Square food photograph for a Chinese barbecue restaurant menu. Subject: 猪肉串, five bamboo skewers of small grilled pork cubes, cumin and chili, authentic Chinese street barbecue. Match a warm premium realistic food photography series: round charcoal-black rustic ceramic plate on dark brown wooden table, close three-quarter overhead angle, food fills frame, warm directional light from upper left, crisp natural food texture, blurred muted background. No people, text, watermark or collage. Save final file for pork-skewers menu asset.
```
