# Notera 离线密码学实施计划

> **供执行者：** 必须使用 `superpowers:executing-plans` 按功能模块执行本计划。测试与实现属于同一功能模块；每个模块完成后提交一次，不拆分微步骤或增加逐任务审核。

**目标：** 在 `packages/crypto` 中实现无项目内依赖的离线密码学能力，包括安全随机数、Argon2id、HKDF-SHA-256、XChaCha20-Poly1305、版本化密钥包装，以及 Profile 密钥创建、解锁和修改主密码。

**架构：** 以 `libsodium-wrappers-sumo` 封装 Argon2id、随机数与 XChaCha20-Poly1305，以标准 WebCrypto 实现 HKDF-SHA-256。`sumo` 构建用于获得 0.8.4 常规精简构建未包含的 `crypto_pwhash`。所有生产参数、AAD 编码和域标签由包内固定；公共 API 无状态且异步，不访问 Profile 存储、数据库、文件系统或 Electron。

**技术栈：** TypeScript、`libsodium-wrappers-sumo` 0.8.4、WebCrypto、Jest、ts-jest、npm workspaces

---

## 范围约束

- 规格来源：`docs/superpowers/specs/2026-08-21-offline-crypto-design.md`。
- 当前只实现离线密钥体系，不实现 Account Root Key、同步 Record Key、同步信封或同步引擎。
- `packages/crypto` 不导入其他 Notera 包。
- 测试直接运行 TypeScript 源码，不依赖 Electron 或 Webpack 构建产物。
- 每个功能模块先补齐本模块单元测试，再完成实现并只运行对应测试；测试与实现合并为同一次提交。
- 全部模块完成后只执行一次必要最终验证；失败后仅复测受影响检查。

## 文件布局

```text
packages/crypto/
  package.json
  tsconfig.json
  src/
    __tests__/
      primitives.test.ts
      kdf.test.ts
      key-wrapping.test.ts
      profile-keys.test.ts
    errors.ts
    sodium.ts
    bytes.ts
    parameters.ts
    random.ts
    kdf.ts
    aead.ts
    key-wrapping.ts
    profile-keys.ts
    index.ts
```

各文件职责：

- `errors.ts`：稳定 `CryptoError` 和错误码，不泄露底层异常内容。
- `sodium.ts`：统一等待 `sodium.ready`，将初始化失败映射为稳定错误。
- `bytes.ts`：字节复制、精确长度校验、规范 Base64、UTF-8 和尽力清零。
- `parameters.ts`：算法版本、固定长度、KDF 参数、HKDF 域和密钥用途。
- `random.ts`：按固定类型生成 Salt、Nonce、Database Key 与 Vault Key。
- `kdf.ts`：内部 Argon2id 适配、HKDF-SHA-256、Password Wrapping Key 和受限子密钥派生。
- `aead.ts`：内部 XChaCha20-Poly1305 加密与解密。
- `key-wrapping.ts`：固定二进制 AAD、版本化信封、32 字节密钥包装与解包。
- `profile-keys.ts`：创建、解锁、修改主密码和密钥包运行时校验。
- `index.ts`：唯一受支持公共入口。

## 功能模块 1：密码学运行时、错误与字节基础

**目标：** 建立后续密码学操作共同依赖的运行时初始化、固定参数、严格输入校验和安全字节工具。

**涉及文件：**

- 修改：`package-lock.json`
- 修改：`packages/crypto/package.json`
- 修改：`packages/crypto/tsconfig.json`
- 创建：`packages/crypto/src/errors.ts`
- 创建：`packages/crypto/src/sodium.ts`
- 创建：`packages/crypto/src/bytes.ts`
- 创建：`packages/crypto/src/parameters.ts`
- 修改：`packages/crypto/src/index.ts`
- 创建：`packages/crypto/src/__tests__/primitives.test.ts`

**功能逻辑：**

1. 通过 `npm install --workspace @notera/crypto --save-exact libsodium-wrappers-sumo@0.8.4` 添加唯一第三方运行时依赖，并让 `packages/crypto/tsconfig.json` 使用 `dom` 与 `es2022` 类型、排除测试目录。
2. 定义以下稳定错误模型：

```ts
export type CryptoErrorCode =
  | 'INVALID_CRYPTO_INPUT'
  | 'UNSUPPORTED_CRYPTO_VERSION'
  | 'AUTHENTICATION_FAILED'
  | 'CRYPTO_INITIALIZATION_FAILED'
  | 'CRYPTO_OPERATION_FAILED';

export class CryptoError extends Error {
  readonly code: CryptoErrorCode;
}
```

3. `sodium.ts` 提供内部 `getSodium()`；所有底层异常只映射为固定错误，测试通过直接导入内部初始化辅助函数验证 rejected Promise，不把辅助函数从包入口导出。
4. `parameters.ts` 固定并冻结以下参数：

```ts
export const CRYPTO_FORMAT_VERSION = 1;
export const KDF_VERSION = 1;
export const SALT_BYTES = 16;
export const KEY_BYTES = 32;
export const NONCE_BYTES = 24;
export const AUTH_TAG_BYTES = 16;
export const ARGON2_OUTPUT_BYTES = 64;
export const ARGON2_OPSLIMIT = 3;
export const ARGON2_MEMLIMIT = 64 * 1024 * 1024;

export enum KeyWrapPurpose {
  DATABASE_KEY = 1,
  VAULT_KEY = 2,
  ATTACHMENT_FILE_KEY = 3,
}

export enum KeyDerivationContext {
  PASSWORD_WRAPPING_KEY = 'notera/password-wrapping-key/v1',
  ATTACHMENT_THUMBNAIL_KEY = 'notera/attachment-thumbnail-key/v1',
}
```

5. `bytes.ts` 提供 `assertByteLength`、`copyBytes`、`encodeUtf8`、规范 Base64 编解码和同步 `wipeBytes`。Base64 必须使用 RFC 4648 标准字母表和填充，解码后通过重新编码比较拒绝非规范形式；错误消息不得包含输入值。
6. `index.ts` 只导出公共错误、版本常量、允许的枚举和 `wipeBytes`，不导出 Sodium 对象或通用参数覆盖接口。

**单元测试：**

- 固定错误码与 `instanceof CryptoError`；
- Libsodium 初始化失败映射为 `CRYPTO_INITIALIZATION_FAILED`；
- UTF-8、字节复制与长度校验；
- Base64 合法往返，以及 Base64URL、非法字符、缺失填充和非规范输入拒绝；
- `wipeBytes` 后目标数组全为零；
- 固定参数值、用途编号和域标签不可由调用方修改；
- `index.ts` 未导出 Sodium 或任意 KDF 参数入口。

**精确测试命令：**

```powershell
npm run test:unit -- packages/crypto/src/__tests__/primitives.test.ts --runInBand
```

预期：`primitives.test.ts` 全部通过，0 个失败。

**完成后提交：**

```powershell
git add package-lock.json packages/crypto
git commit -m "feat(crypto): establish crypto runtime"
```

## 功能模块 2：安全随机数与密钥派生

**目标：** 实现固定参数的随机值生成、Argon2id、HKDF-SHA-256、Password Wrapping Key 和域隔离子密钥。

**涉及文件：**

- 创建：`packages/crypto/src/random.ts`
- 创建：`packages/crypto/src/kdf.ts`
- 修改：`packages/crypto/src/index.ts`
- 创建：`packages/crypto/src/__tests__/kdf.test.ts`

**功能逻辑：**

1. `random.ts` 在等待 Sodium 就绪后调用 `randombytes_buf`，只公开固定长度函数：

```ts
generateSalt(): Promise<Uint8Array>;
generateNonce(): Promise<Uint8Array>;
generateDatabaseKey(): Promise<Uint8Array>;
generateVaultKey(): Promise<Uint8Array>;
```

2. `kdf.ts` 的内部 Argon2id 适配使用 `crypto_pwhash_ALG_ARGON2ID13`。生产入口只能读取 `parameters.ts` 的 64 MiB、opslimit 3、16 字节 Salt 和 64 字节输出，不能接受调用方参数。
3. HKDF 使用 `globalThis.crypto.subtle`：导入原始 IKM，采用 SHA-256、显式 Salt 和 Info，派生指定长度后立即复制结果；WebCrypto 不存在时返回 `CRYPTO_INITIALIZATION_FAILED`。
4. Password Wrapping Key 流程固定为：原始密码 UTF-8 → Argon2id 64 字节 → HKDF 空 Salt、`PASSWORD_WRAPPING_KEY` Info → 32 字节密钥。密码为空或 Salt 长度错误时返回 `INVALID_CRYPTO_INPUT`。
5. `deriveSubkey(sourceKey, context)` 只接受 `KeyDerivationContext`，不接受自由字符串；同一源密钥在不同域中必须得到不同结果。
6. Argon2id 中间结果、密码 UTF-8 副本和不再需要的临时密钥在 `finally` 中清零。

**关键接口：**

```ts
export async function derivePasswordWrappingKey(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array>;

export async function deriveSubkey(
  sourceKey: Uint8Array,
  context: KeyDerivationContext,
): Promise<Uint8Array>;
```

**单元测试：**

- Libsodium 已知 Argon2id 向量：密码 `correct horse battery staple`、Salt `808182838485868788898a8b8c8d8e8f`、64 MiB、opslimit 2、16 字节输出为 `720f95400220748a811bca9b8cff5d6e`；该可配置适配器仅供内部测试，不能从 `index.ts` 导出。
- RFC 5869 SHA-256 Test Case 1：验证 OKM 为 `3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865`。
- 生产 Password Wrapping Key 使用固定参数并输出 32 字节。
- Unicode 密码按原始 UTF-8 处理，不自动规范化或裁剪空白。
- 空密码、错误 Salt 长度和错误源密钥长度返回 `INVALID_CRYPTO_INPUT`。
- 两次随机 Salt、Nonce 和两种 Profile 密钥长度正确且结果不同。
- 相同源密钥在两个允许域中派生结果不同。

**精确测试命令：**

```powershell
npm run test:unit -- packages/crypto/src/__tests__/kdf.test.ts --runInBand
```

预期：`kdf.test.ts` 全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/crypto/src
git commit -m "feat(crypto): implement key derivation"
```

## 功能模块 3：AEAD 与版本化密钥包装

**目标：** 用固定 XChaCha20-Poly1305 参数、二进制 AAD 和严格信封格式安全包装 32 字节密钥。

**涉及文件：**

- 创建：`packages/crypto/src/aead.ts`
- 创建：`packages/crypto/src/key-wrapping.ts`
- 修改：`packages/crypto/src/index.ts`
- 创建：`packages/crypto/src/__tests__/key-wrapping.test.ts`

**功能逻辑：**

1. `aead.ts` 提供包内加密与解密函数，精确校验 32 字节密钥、24 字节 Nonce 和最小密文长度。Libsodium 认证异常统一映射为 `AUTHENTICATION_FAILED`，其他底层错误映射为 `CRYPTO_OPERATION_FAILED`。
2. AAD 使用以下固定二进制格式：

```text
UTF-8("notera/key-wrap")
uint8(格式版本 1)
uint8(KeyWrapPurpose)
uint16-big-endian(上下文 UTF-8 字节长度)
上下文 UTF-8 字节
```

上下文长度必须为 1 至 65535 字节。AAD 构造函数不从信封读取 Profile ID 或 Vault ID。
3. `WrappedKeyEnvelope` 是只读对象，字段固定为 `version`、规范 Base64 `nonce` 和规范 Base64 `ciphertext`。
4. `wrapKey` 只接受 32 字节包装密钥与被包装密钥，内部生成 Nonce，并根据调用方给出的用途与可信上下文构造 AAD。
5. `unwrapKey` 先验证信封版本、字段和长度，再用调用方给出的用途与上下文认证；解出结果必须恰好 32 字节。
6. 未知版本返回 `UNSUPPORTED_CRYPTO_VERSION`；有效形状数据的错误密钥、用途、上下文或篡改统一返回 `AUTHENTICATION_FAILED`。

**关键接口：**

```ts
export type WrappedKeyEnvelope = Readonly<{
  version: 1;
  nonce: string;
  ciphertext: string;
}>;

export type KeyWrapContext = Readonly<{
  purpose: KeyWrapPurpose;
  contextId: string;
}>;

export async function wrapKey(
  wrappingKey: Uint8Array,
  keyToWrap: Uint8Array,
  context: KeyWrapContext,
): Promise<WrappedKeyEnvelope>;

export async function unwrapKey(
  wrappingKey: Uint8Array,
  envelope: unknown,
  context: KeyWrapContext,
): Promise<Uint8Array>;
```

**单元测试：**

- XChaCha20-Poly1305 已知答案使用 Key `808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f`、Nonce `404142434445464748494a4b4c4d4e4f5051525354555657`、AAD `50515253c0c1c2c3c4c5c6c7` 和 Libsodium 官方测试明文，验证期望密文：

```text
bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb
731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b452
2f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9
21f9664c97637da9768812f615c68b13b52ec0875924c1c7987947deafd8780acf49
```
- 正常包装/解包往返。
- 相同输入独立包装生成不同 Nonce 和密文。
- 修改有效长度 Nonce、密文、包装密钥、用途或上下文时认证失败。
- Database Key、Vault Key、附件 File Key 用途不可互换。
- 跨 Profile/Vault 上下文替换认证失败。
- 非法 Base64、错误长度、截断密文和缺失字段返回 `INVALID_CRYPTO_INPUT`。
- 未知信封版本返回 `UNSUPPORTED_CRYPTO_VERSION`。
- AAD 长度前缀、用途编号和大端序编码得到固定字节结果。

**精确测试命令：**

```powershell
npm run test:unit -- packages/crypto/src/__tests__/key-wrapping.test.ts --runInBand
```

预期：`key-wrapping.test.ts` 全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/crypto/src
git commit -m "feat(crypto): implement authenticated key wrapping"
```

## 功能模块 4：Profile 密钥包用例

**目标：** 将固定密码派生和密钥包装组合为原子、无状态的 Profile 创建、解锁和主密码修改能力。

**涉及文件：**

- 创建：`packages/crypto/src/profile-keys.ts`
- 修改：`packages/crypto/src/index.ts`
- 创建：`packages/crypto/src/__tests__/profile-keys.test.ts`

**功能逻辑：**

1. 定义并运行时校验版本化 `PasswordKeyPackage`：

```ts
export type PasswordKeyPackage = Readonly<{
  version: 1;
  kdfVersion: 1;
  salt: string;
  wrappedDatabaseKey: WrappedKeyEnvelope;
  wrappedVaultKey: WrappedKeyEnvelope;
}>;
```

2. `createProfileKeyPackage` 生成新 Salt、Database Key 和 Vault Key，派生 Password Wrapping Key，并使用同一可信 Profile ID、不同用途与不同 Nonce 包装两把密钥。失败时清零所有已生成的明文密钥；成功时只把调用方需要的两把密钥所有权交给调用方。
3. `unlockProfileKeyPackage` 接受 `unknown` 密钥包，先完成结构和版本校验，再派生包装密钥。只有两把密钥都认证成功且长度正确时才返回；第二把失败时清零第一把。
4. `changeProfilePassword` 先用旧密码完整解锁，再生成新 Salt 和两个新 Nonce，用新密码重新包装原密钥。返回新密钥包，不修改输入对象；所有成功或失败路径都清零内部临时明文副本。
5. Profile ID 始终由调用方提供，不写入或信任密钥包字段。主密码、密码哈希和 Password Wrapping Key 不出现在返回值中。
6. `index.ts` 导出稳定公共类型和用例，继续隐藏底层 Sodium、通用 AAD、任意参数 KDF 和测试适配器。

**关键接口：**

```ts
export async function createProfileKeyPackage(
  password: string,
  profileId: string,
): Promise<{
  keyPackage: PasswordKeyPackage;
  databaseKey: Uint8Array;
  vaultKey: Uint8Array;
}>;

export async function unlockProfileKeyPackage(
  password: string,
  profileId: string,
  keyPackage: unknown,
): Promise<{ databaseKey: Uint8Array; vaultKey: Uint8Array }>;

export async function changeProfilePassword(
  oldPassword: string,
  newPassword: string,
  profileId: string,
  keyPackage: unknown,
): Promise<PasswordKeyPackage>;
```

**单元测试：**

- 创建结果的版本、Salt、信封、密钥长度和规范 Base64 正确；两把底层密钥不同，两个 Nonce 不同。
- 创建后用同一密码和 Profile ID 解锁得到原始 Database Key 与 Vault Key。
- 错误密码、错误 Profile ID、两种信封互换、跨 Profile 整包替换均返回 `AUTHENTICATION_FAILED`。
- 一个信封成功、另一个失败时不返回部分结果，并清零已解出的临时密钥。
- 修改主密码后 Database Key 与 Vault Key 字节不变，新密码可解锁，旧密码不可解锁；新 Salt 和两个新 Nonce 与旧包不同。
- 修改密码失败时输入密钥包保持深度相等且没有字段被修改。
- 空密码、空 Profile ID、未知包/KDF 版本、缺失字段、未知额外字段和非法嵌套信封返回规定错误码。
- 公共入口导出完整离线 API，但不含 Account Root Key、Record Key、同步或 Profile 生命周期能力。

**精确测试命令：**

```powershell
npm run test:unit -- packages/crypto/src/__tests__/profile-keys.test.ts --runInBand
```

预期：`profile-keys.test.ts` 全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/crypto/src
git commit -m "feat(crypto): implement profile key packages"
```

## 最终验证

全部四个功能模块完成后只运行以下一次最终验证：

```powershell
npm run test:unit -- packages/crypto/src/__tests__ --runInBand
npm run typecheck -w @notera/crypto
npm run lint
npm run check:deps
git diff --check
```

预期结果：

- crypto 测试套件全部通过，0 个失败；
- `@notera/crypto` 包级类型检查通过；
- 全项目 ESLint 通过；
- 依赖检查显示 0 个违规，`packages/crypto` 没有项目内依赖；
- `git diff --check` 无输出；
- 工作区只保留用户原有且未纳入本计划的未跟踪内容。

若某项失败，只修复失败原因并复测受影响的检查，不重复运行已经通过且未受影响的全量检查。最终验证修复若涉及功能逻辑，纳入对应功能模块提交；若只涉及统一格式规则，在所有检查通过后创建一次收尾提交。

## 完成标准

- 四个功能模块分别完成一次提交；
- 实现规格中规定的离线算法、密钥包、AAD、错误模型和密钥生命周期；
- 密码学 API 无状态、版本化、难以降级误用；
- 单元测试覆盖已知答案、篡改、AAD 替换、域隔离、错误密码和密码修改；
- 不访问文件、数据库或 Electron，不依赖其他 Notera 包；
- 不包含任何同步协议、同步引擎或同步专用密钥能力；
- 必要最终验证全部通过。
