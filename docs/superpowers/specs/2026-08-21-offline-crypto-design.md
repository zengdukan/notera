# Notera 离线密码学设计

**日期：** 2026-08-21  
**状态：** 已确认，待实施  
**范围：** `packages/crypto`

## 1. 目标

在 `packages/crypto` 中实现当前离线阶段需要的纯密码学能力，为后续 Profile 解锁、SQLCipher、附件加密和 `ProfileSession` 提供稳定且难以误用的 API。

本设计遵循总体架构确定的密码学基线：

- Argon2id；
- HKDF-SHA-256；
- XChaCha20-Poly1305；
- 所有随机数来自操作系统 CSPRNG；
- Database Key 与 Vault Key 均为随机生成并由主密码派生的包装密钥保护；
- 修改主密码只重新包装密钥，不重新加密数据库或附件。

实现采用 `libsodium-wrappers`。Argon2id、随机数和 XChaCha20-Poly1305 由 Libsodium 提供；HKDF-SHA-256 使用标准 WebCrypto。包本身不依赖其他 Notera 包。

## 2. 非目标

本阶段不实现：

- Profile 持久化、Profile 索引或 `ProfileSession`；
- SQLCipher 连接或数据库访问；
- 附件文件、分块、Manifest 或 Media Gateway；
- Electron、IPC 或 UI；
- 主密码强度界面、重试限速或自动锁定；
- 云账户 Argon2id、Account Root Key、认证凭据；
- 同步 Revision、Record Key、同步信封、Outbox、冲突或远端附件状态；
- 操作系统钥匙串、锁页内存、TPM 或硬件密钥保护。

## 3. 参考实现结论

Standard Notes 将 Libsodium 包装在独立密码学接口之后，使用 Argon2id、XChaCha20-Poly1305、域隔离的子密钥派生和附件流加密。它与 Notera 的既定算法最接近，可以参考其“统一封装底层库、业务层不直接调用 Sodium”的边界。

Joplin 当前主要通过 WebCrypto 使用 PBKDF2 和 AES-GCM，并维护兼容旧加密格式的版本分支。它证明了跨运行时封装和格式版本化的重要性，但其算法基线不适用于 Notera，不能直接照搬。

Notera 只吸收两者的边界和版本化经验，不复制其同步协议、旧格式兼容层或完整加密抽象体系。

## 4. 架构与依赖边界

`packages/crypto` 采用分层、无状态设计：

```text
packages/crypto/src/
  errors.ts          # 稳定 CryptoError 与错误码
  bytes.ts           # 字节复制、长度校验、严格 Base64 和清零
  parameters.ts      # 版本化算法参数与允许的域标签
  random.ts          # Salt、Nonce、Database Key、Vault Key
  kdf.ts             # Argon2id 与 HKDF-SHA-256
  aead.ts            # XChaCha20-Poly1305
  key-wrapping.ts    # 密钥包装、解包和重新包装
  profile-keys.ts    # 创建、解锁和修改主密码的纯密码学用例
  index.ts           # 唯一公共入口
```

约束如下：

- 只依赖 `libsodium-wrappers` 和运行时标准 WebCrypto，不依赖 `domain`、Node 文件系统、数据库或 Electron；
- `index.ts` 是唯一受支持的公共入口，不导出 Sodium 实例、内部参数注册表或内部测试接口；
- 除只清除调用方缓冲区的同步 `wipeBytes` 外，公共密码学操作统一为异步 API，并在内部等待 `sodium.ready`；
- 初始化 Promise 在模块内部复用，但模块不保存任何 Profile 密钥或会话状态；
- 调用失败不会修改输入密钥包，也不会留下可供后续调用读取的部分状态。

## 5. 数据表示与输入校验

### 5.1 内存表示

密钥、Salt、Nonce、明文和密文统一使用 `Uint8Array`。公共 API 返回新的字节数组，不把内部临时缓冲区直接暴露给调用方。

所有密码学入口都执行运行时校验，包括：

- 密钥、Salt 和 Nonce 的精确长度；
- 密文至少包含完整认证标签；
- 版本号是否受支持；
- 字符串上下文的 UTF-8 长度是否处于 1 至 65535 字节；
- Base64 是否符合规范且解码后能重新编码为同一规范形式。

主密码按原始 JavaScript 字符串进行 UTF-8 编码，不做 Unicode 规范化、大小写转换或首尾空白处理。密码必须非空；强度策略由上层负责。

### 5.2 持久化表示

只有密钥包边界使用 RFC 4648 标准 Base64，要求规范填充，不接受 Base64URL、混合字母表、忽略非法字符或非规范等价写法。

```ts
export type WrappedKeyEnvelope = Readonly<{
  version: 1;
  nonce: string;
  ciphertext: string;
}>;

export type PasswordKeyPackage = Readonly<{
  version: 1;
  kdfVersion: 1;
  salt: string;
  wrappedDatabaseKey: WrappedKeyEnvelope;
  wrappedVaultKey: WrappedKeyEnvelope;
}>;
```

Profile ID 不写入密钥包。解包时必须由可信调用方传入预期 Profile ID，并以此重新构造 AAD，避免攻击者同时替换密钥包及其自报上下文。

## 6. 算法版本 1

### 6.1 固定参数

`v1` 参数由包内注册表固定，业务调用方不能覆盖：

| 能力 | 参数 |
| --- | --- |
| Argon2id | `crypto_pwhash_ALG_ARGON2ID13`，64 MiB，opslimit 3，并行度 1，16 字节 Salt，64 字节输出 |
| HKDF | HKDF-SHA-256，32 字节输出 |
| AEAD | XChaCha20-Poly1305-IETF，32 字节密钥，24 字节 Nonce，16 字节认证标签 |
| Database Key | 32 字节随机值 |
| Vault Key | 32 字节随机值 |

持久化结构只保存 `kdfVersion`，不保存可由攻击者修改的任意内存、迭代次数或输出长度。未知版本必须在执行 KDF 前拒绝。

### 6.2 Password Wrapping Key

密码派生流程为：

```text
主密码 UTF-8 + 16 字节随机 Salt
              │ Argon2id v1
              ▼
       64 字节密码材料
              │ HKDF-SHA-256
              │ salt = 空字节串
              │ info = "notera/password-wrapping-key/v1"
              ▼
  32 字节 Password Wrapping Key
```

Argon2id 输出不会直接作为 AEAD 密钥。HKDF 用固定域标签生成所需长度并把密码材料用途与未来其他派生用途隔离。

### 6.3 允许的 HKDF 域

公共 API 只接受导出的枚举值，不接受自由字符串：

- `PASSWORD_WRAPPING_KEY` → `notera/password-wrapping-key/v1`；
- `ATTACHMENT_THUMBNAIL_KEY` → `notera/attachment-thumbnail-key/v1`。

同步专用域在同步子项目中另行设计，不提前加入。

## 7. 密钥包装与 AAD

Database Key 和 Vault Key 分别用 Password Wrapping Key 加密。每次包装都生成独立的 24 字节随机 Nonce，不使用计数器，不允许调用方提供生产 Nonce。

AAD 使用固定二进制编码，避免 JSON 属性顺序、分隔符或 Unicode 表示产生歧义：

```text
magic bytes     = UTF-8("notera/key-wrap")
format version  = uint8(1)
purpose         = uint8(1: database-key, 2: vault-key, 3: attachment-file-key)
context length  = uint16 big-endian
context bytes   = 调用方提供的 Profile ID 或 Vault ID 的 UTF-8
```

解包时由调用方提供预期上下文和用途。以下替换都必须认证失败：

- Database Key 与 Vault Key 信封互换；
- 从一个 Profile 复制到另一个 Profile；
- 附件 File Key 被当作 Profile 密钥解包；
- 修改有效长度的 Nonce、密文或上下文字节。

未知格式版本在认证前返回 `UNSUPPORTED_CRYPTO_VERSION`；已支持版本之间的替换在未来新增版本时必须受 AAD 保护，不能降级解释。

`attachment-file-key` 仅提供通用包装能力，为后续 `attachments` 使用；本阶段不实现附件文件操作。

## 8. 公共用例

### 8.1 创建 Profile 密钥包

```ts
createProfileKeyPackage(password, profileId): Promise<{
  keyPackage: PasswordKeyPackage;
  databaseKey: Uint8Array;
  vaultKey: Uint8Array;
}>
```

流程：

1. 校验密码和 Profile ID；
2. 生成随机 Salt、Database Key 和 Vault Key；
3. 派生 Password Wrapping Key；
4. 用不同 Nonce 和不同用途 AAD 包装两把密钥；
5. 返回可持久化密钥包和当前会话使用的两把明文密钥；
6. 清零中间密码材料与 Password Wrapping Key。

### 8.2 解锁 Profile 密钥包

```ts
unlockProfileKeyPackage(password, profileId, keyPackage): Promise<{
  databaseKey: Uint8Array;
  vaultKey: Uint8Array;
}>
```

只有两把密钥都成功认证、长度正确时才返回。如果第二把密钥失败，必须先清零已解出的第一把密钥，再返回统一认证错误。

### 8.3 修改主密码

```ts
changeProfilePassword(
  oldPassword,
  newPassword,
  profileId,
  keyPackage,
): Promise<PasswordKeyPackage>
```

流程：

1. 用旧密码完整解锁两把密钥；
2. 生成新 Salt；
3. 用新密码派生新的 Password Wrapping Key；
4. 使用两个新 Nonce 重新包装原 Database Key 和 Vault Key；
5. 返回新的密钥包；
6. 清零旧、新密码材料及临时明文密钥副本。

原 Database Key 和 Vault Key 的字节必须保持不变，因此无需重新加密 SQLCipher 数据库或附件。任何失败都保留原密钥包不变。

### 8.4 通用低层能力

公开但受约束的能力包括：

- 生成固定种类和长度的随机密钥、Salt 与 Nonce；
- 使用批准的域派生子密钥；
- 使用固定算法、用途和上下文包装或解包 32 字节密钥；
- 清零调用方拥有的 `Uint8Array`。

不公开任意 Argon2 参数、任意算法名、任意 AEAD AAD 字节或生产环境自定义随机源。

## 9. 错误模型

统一导出 `CryptoError`，包含稳定 `code`，不把底层异常、密码、密钥或输入内容放入错误消息。

| 错误码 | 含义 |
| --- | --- |
| `INVALID_CRYPTO_INPUT` | 空密码、非法 Base64、错误长度或非法上下文 |
| `UNSUPPORTED_CRYPTO_VERSION` | 密钥包、KDF 或信封版本未知 |
| `AUTHENTICATION_FAILED` | 错误密码、错误上下文、错误用途或有效形状密文认证失败 |
| `CRYPTO_INITIALIZATION_FAILED` | Libsodium 或标准 WebCrypto 不可用 |
| `CRYPTO_OPERATION_FAILED` | 随机数、KDF、加密或派生发生非认证类底层失败 |

对于形状合法的密钥包，错误密码、密文篡改、AAD 不匹配和密钥不匹配统一映射为 `AUTHENTICATION_FAILED`，调用方不能据此区分内部失败位置。

## 10. 密钥生命周期与日志

- Argon2id 中间结果、Password Wrapping Key 和内部临时明文密钥副本在 `finally` 中调用 `sodium.memzero`；
- 返回给调用方的 Database Key 和 Vault Key 由未来 `ProfileSession.close()` 通过 `wipeBytes` 清除；
- 包内不缓存密码、派生密钥、Profile 密钥或解密结果；
- 包内不记录密码、密钥、Salt、Nonce、AAD、密文或明文；
- 包内错误只包含稳定错误码和不敏感的固定消息。

JavaScript 字符串不可由应用可靠清零，运行时和原生/WASM 边界也可能产生不可控复制。因此这里只承诺尽力清零由包拥有的可变字节缓冲区，不宣称达到锁页内存、进程取证防护或硬件密钥保护级别。

## 11. 单元测试

测试位于 `packages/crypto/src/__tests__`，不依赖 Electron、数据库、文件系统或网络。

必须覆盖：

- Argon2id 固定输入和固定参数得到固定输出；
- 生产参数只能由版本注册表选择，调用方不能降低；
- HKDF-SHA-256 通过 RFC 5869 已知答案；
- XChaCha20-Poly1305 通过官方或独立已知答案；
- AEAD 正常往返，以及密文、Nonce、AAD、密钥替换后的认证失败；
- 相同密钥和明文的独立包装使用不同 Nonce 并产生不同密文；
- Database Key 与 Vault Key 长度正确且彼此独立；
- 错误密码、错误 Profile ID、密钥信封互换和跨 Profile 替换；
- 修改主密码后底层两把密钥保持不变，新密码可用、旧密码不可用；
- 非法 Base64、错误长度、截断密文、未知版本和缺失字段；
- HKDF 域隔离；
- `wipeBytes` 把目标缓冲区全部归零；
- Libsodium 初始化失败映射为稳定错误；
- 公共入口未导出 Sodium 实例、内部参数或同步能力。

已知答案测试可以直接测试内部固定参数适配层；生产公共 API 仍不允许调用方传入测试参数。完整 Profile 密钥包测试至少使用一次生产 Argon2id 参数，其余非 KDF 行为测试应复用已派生结果，避免无意义地重复执行高成本 KDF。

## 12. 验证与完成标准

实施期间按完整功能模块推进，每个模块完成功能逻辑和单元测试后提交一次。只运行当前模块相关测试；全部模块完成后执行一次必要的最终验证。

完成标准：

- `packages/crypto` 可独立通过类型检查和单元测试；
- Argon2id、HKDF-SHA-256、XChaCha20-Poly1305 和随机数均使用既定实现；
- Profile 密钥创建、解锁和修改主密码符合本设计；
- 所有密钥包字段、算法参数、AAD 和错误码均为稳定且版本化的公共合约；
- 依赖边界检查确认 `crypto` 没有项目内依赖；
- Lint 通过；
- 未实现或导出任何同步协议、同步引擎或同步专用密钥能力。
