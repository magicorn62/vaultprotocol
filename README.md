# VaultProtocol: Decentralized Stealth Notary System

VaultProtocol is a next-generation decentralized notary system designed to replace the traditional, often expensive, slow, and invasive process of human-mediated notarization with a fast, cheap, zero-trust, and private alternative.

By eliminating human intermediaries, VaultProtocol leverages mathematics, deliberate architecture, and decentralized consensus** to provide an immutable chain of custody. This ensures stronger non-repudiation than traditional methods, as every act of notarization is cryptographically signed by the user’s wallet and anchored on a public blockchain.

---

# The Problem vs. The Solution

Traditional Notary vs. VaultProtocol

1. Cost: Traditional notarization incurs high per-act fees and travel costs, whereas VaultProtocol requires only minimal network gas and storage fees.

2. Speed: Traditional methods are slow due to scheduling requirements and physical presence, while VaultProtocol offers instant, browser-based automation.

3. Privacy: Traditional notaries require invasive physical inspection of IDs and documents; VaultProtocol utilizes zero-knowledge proofs so your content remains private.

4. Intermediary: Traditional systems rely on a human notary (a single point of failure/trust), while VaultProtocol relies on code and blockchain consensus (zero-trust).

5. Non-Repudiation: Traditional records are paper-based and can be forged or degraded; VaultProtocol provides cryptographic, mathematically immutable proof.

---

# Architecture & Security Model

# 1. Client-Side "Zero-Backend" Design
The application runs entirely within the user’s browser using the Web Crypto API. There is no central server storing user data.
1.  Privacy First: Files are encrypted locally before any transmission. The platform never sees your raw data.
2.   Attack Surface Reduction: By removing backend infrastructure, we eliminate risks associated with database breaches or server-side leaks.
3.   Accessibility: Works directly in the browser; no complex software installation required.

# 2. The "Stealth" Privacy Model
Traditional digital notarization often exposes file contents to auditors. VaultProtocol uses a dual-key encryption model to preserve privacy while proving existence:
1.  Master Key (Content): Decrypts the actual file data using AES-256.
2.  Mask Key (Location): Decrypts the "Stealth CID," which points to where the encrypted file is stored on IPFS.

This ensures that while the existence and integrity of the document are publicly verifiable on-chain, the content and storage location remain strictly private until authorized decryption occurs.

---

# Core Features

# 1. Dapp / Anchor (The Notarization Engine)
This module performs the core legal function of a notary: certifying that a specific document existed in a specific state at a specific time, linked to a specific identity (Wallet Address). Users can choose between two modes:

# A. Full Protocol Mode (Full Chain of Custody)
Establishes a robust link between identity, content integrity, and secure storage location.
1.  Local Encryption: The file is encrypted with a Master Key on the local device.
2.  IPFS Upload: The encrypted blob is uploaded to IPFS via Pinata.
3.  Location Masking: The resulting IPFS CID is encrypted with a Mask Key to create a Stealth CID (SCID). This hides the file's location from public view.
4.  Blockchain Anchor: The original SHA-256 hash and the Stealth CID are recorded on-chain.

   Legal Value: Proves "User X possessed File Y at Time T" without revealing what File Y contains or where it is stored. Only holders of both keys can verify the content.

# B. Hash-Only Mode (Proof of Existence)
For users who require only proof of existence, with no data leaving their device.
1.  Local Hashing: SHA-256 hash generated locally.
2.  No Upload: The file never leaves the user's computer.
3.  Blockchain Record: Anchors `mode: "hash-only"` to the blockchain.

   Legal Value: Provides a timestamped, immutable proof that the document existed in its current state at a specific time, suitable for drafts or highly sensitive internal records where cloud storage is not desired.

# 2. Verify (Proof of Ownership & Integrity)
The verification interface allows users and third-party auditors to validate claims made by the anchor.

# A. Decrypt / Unmask CID
*   Input: Stealth CID + Mask Key.
*   Output: The actual IPFS location and access to the encrypted blob.
*   Use Case: Proving that you hold the keys to a notarized document, verifying originator identity without exposing data to others.

# B. Decrypt File
*   Input: Encrypted Blob + Master Key.
*   Output: Original File + Recalculated Hash.
*   Use Case: Verifying that the decrypted file matches the hash anchored on-chain. If hashes match, it proves non-repudiation: the file has not been altered since notarization.

# 3. Ledger (Audit Trail)
The ledger provides a transparent, searchable history of all anchoring transactions for the connected wallet.
*   Records: Original Hashes, Stealth CIDs, Transaction Timestamps, and Block Numbers.
*   Auditing: Allows users to review their notarization history and verify that records are permanently stored on the decentralized network.

---

# Technology Stack

*   Frontend: React (TypeScript)
*   Cryptography: Web Crypto API (`crypto.subtle`) for AES-256 & SHA-256.
*   Blockchain Interaction: Ethers.js v5
*   Network: Hedera Testnet (EVM Compatible)
*   Storage: IPFS via Pinata Gateway

---

# Security & Responsibility

1. Key Management: VaultProtocol does not store or have access to your Master Keys, Mask Keys, or JWT tokens. If you lose these keys, your data is irretrievable.
2. No Backend Liability: Since the application is client-side only, there are no server logs containing user data.

