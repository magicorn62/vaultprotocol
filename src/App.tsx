import './index.css';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CryptoUtils } from './utils/crypto';
import { Validators } from './utils/validators';
import { Logger } from './utils/logger';
import Icon from './components/Icon';
import CopyBox from './components/CopyBox';



const CONFIG = {
    CONTRACT_ADDRESS: "0x0a8BaA8a631f78e6eba933B380c577d1275C6F08",
    TOKEN_ADDRESS: "0xA8b382b2430f31e5D12bbAd9ba47BeDEd1afF6Ae",
    NOTARY_FEE: "10",
    PINATA_API_URL: "https://api.pinata.cloud/pinning/pinFileToIPFS",
    PINATA_GATEWAY_URL: "https://gateway.pinata.cloud/ipfs",
    PBKDF2_ITERATIONS: 600000,
    MAX_FILE_SIZE: 52428800, //50MB
    SESSION_TIMEOUT_MS: 3600000,
    HEDERA_CHAIN_ID: '0x128', // Hedera Testnet chain ID (296 in decimal)
    HEDERA_NETWORK_NAME: 'Hedera Testnet',
    HEDERA_RPC_URL: 'https://testnet.hashio.io/api',
    HEDERA_MIRROR_NODE_URL: 'https://testnet.mirrornode.hedera.com/api/v1',
};

const ABI = [
    "function recordIdea(string _originalHash, string _stealthCID) public",
    "function getMyRecordsCount() public view returns (uint256)",
    "function getMyRecord(uint256 _index) public view returns (tuple(uint64 timestamp, uint32 version, string originalHash, string stealthCID))"
];

interface SessionData {
    blob: Blob | null;
    name: string;
    orig: string;
    cid: string;
    stealthCID: string;
    txHash: string;
    blockNum: number;
    chainTime: string;
}

interface LedgerRecord {
    index: number;
    hash: string;
    stealthCID: string;
    date: string;
    version: number;
}


function App() {
    const [view, setView] = useState<'anchor' | 'verify' | 'ledger'>('anchor');
    const [anchorStep, setAnchorStep] = useState(1);
    const [verifyTab, setVerifyTab] = useState<'decrypt' | 'unmask'>('decrypt');
    const [user, setUser] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [records, setRecords] = useState<Array<LedgerRecord>>([]);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const [isEncrypting, setIsEncrypting] = useState(false);
    const [isMasking, setIsMasking] = useState(false);
    const [isAnchoring, setIsAnchoring] = useState(false);
    const [pass, setPass] = useState('');
    const [passConfirm, setPassConfirm] = useState('');
    const [maskPass, setMaskPass] = useState('');
    const [maskPassConfirm, setMaskPassConfirm] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const [fileToDecrypt, setFileToDecrypt] = useState<File | null>(null);
    const [filePass, setFilePass] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [decryptedResult, setDecryptedResult] = useState<{ blob: Blob; name: string; hash: string } | null>(null);
    const [stealthCIDInput, setStealthCIDInput] = useState('');
    const [cidMaskKey, setCidMaskKey] = useState('');
    const [unmaskedCID, setUnmaskedCID] = useState('');
    const [showReceipt, setShowReceipt] = useState(false);


    const [sessionData, setSessionData] = useState<SessionData>({
        blob: null, name: "", orig: "", cid: "", stealthCID: "",
        txHash: "", blockNum: 0, chainTime: ""
    });
    const [skipCloud, setSkipCloud] = useState(false);
    const [skipEncryption, setSkipEncryption] = useState(false);
    const [copiedNotification, setCopiedNotification] = useState(false);

    // Transaction details modal state
    const [showTxDetails, setShowTxDetails] = useState(false);
    const [txDetails, setTxDetails] = useState<{
        fileName: string;
        originalHash: string;
        stealthCID: string;
        estimatedGas: string;
        gasPrice: string;
        estimatedCost: string;
    } | null>(null);

    // JWT popup state
    const [showJWTPopup, setShowJWTPopup] = useState(false);
    const [jwtInput, setJwtInput] = useState('');
    const [jwtError, setJwtError] = useState('');

    useEffect(() => {
        if (status) {
            const timer = setTimeout(() => setStatus(''), 4000);
            return () => clearTimeout(timer);
        }
    }, [status]);

    useEffect(() => {
        if (copiedNotification) {
            const timer = setTimeout(() => setCopiedNotification(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [copiedNotification]);

    useEffect(() => {
        if (user) {
            const timeout = setTimeout(() => {
                setUser(null);
                setStatus('⚠️ Session expired - please reconnect');
            }, CONFIG.SESSION_TIMEOUT_MS);
            return () => clearTimeout(timeout);
        }
    }, [user]);

    useEffect(() => {
        // Listen for network changes
        const ethereum = (window as unknown as { ethereum?: { on?: (event: string, callback: (chainId: string) => void) => void; }; }).ethereum;
        if (!ethereum?.on) return;

        const handleChainChanged = (chainId: string) => {
            if (chainId !== CONFIG.HEDERA_CHAIN_ID) {
                setStatus('⚠️ You switched away from Hedera Testnet - transactions disabled');
            } else {
                setStatus('✅ Back on Hedera Testnet');
            }
        };

        ethereum.on('chainChanged', handleChainChanged);
        return () => {
            // Cleanup listener (note: some wallets don't support removeListener)
            if (ethereum.on && typeof (ethereum as { removeListener?: (event: string, callback: (chainId: string) => void) => void; }).removeListener === 'function') {
                (ethereum as { removeListener: (event: string, callback: (chainId: string) => void) => void; }).removeListener('chainChanged', handleChainChanged);
            }
        };
    }, []);

    useEffect(() => {
        // Load ledger records when switching to ledger view
        if (view === 'ledger' && user) {
            loadLedger();
        }
    }, [view, user]);

    const checkAndSwitchNetwork = async () => {
        const ethereum = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown>; }; }).ethereum;
        if (!ethereum) {
            setStatus('❌ Metamask not found');
            return false;
        }

        try {
            // Get current chain ID
            const chainId = await ethereum.request({ method: 'eth_chainId' }) as string;
            // console.log('Current chain ID:', chainId);

            if (chainId === CONFIG.HEDERA_CHAIN_ID) {
                setStatus('✅ On Hedera Testnet');
                return true;
            }

            //console.log('Not on Hedera Testnet, current:', chainId, 'target:', CONFIG.HEDERA_CHAIN_ID);

            // Try to switch to Hedera Testnet
            setStatus('⚠️ Switching to Hedera Testnet...');
            try {
                await ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: CONFIG.HEDERA_CHAIN_ID }],
                });
                // console.log('Successfully switched to Hedera Testnet');
                setStatus('✅ Switched to Hedera Testnet');
                return true;
            } catch (switchError: unknown) {
                const error = switchError as { code?: number; message?: string };
                // console.log('Switch error code:', error.code, 'message:', error.message);

                // Only add if network doesn't exist (code 4902)
                if (error.code === 4902) {
                    //console.log('Network not found, adding Hedera Testnet...');
                    setStatus('⚠️ Adding Hedera Testnet...');
                    try {
                        await ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: CONFIG.HEDERA_CHAIN_ID,
                                chainName: CONFIG.HEDERA_NETWORK_NAME,
                                rpcUrls: [CONFIG.HEDERA_RPC_URL],
                                nativeCurrency: {
                                    name: 'HBAR',
                                    symbol: 'HBAR',
                                    decimals: 18,
                                },
                                blockExplorerUrls: ['https://hashscan.io/testnet'],
                            }],
                        });
                        //console.log('Network added successfully');

                        // Delay to ensure network is registered
                        await new Promise(resolve => setTimeout(resolve, 500));

                        // switch to it
                        setStatus('⚠️ Switching to Hedera Testnet...');
                        await ethereum.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: CONFIG.HEDERA_CHAIN_ID }],
                        });
                        //console.log('Switched after adding');
                        setStatus('✅ Hedera Testnet added and active');
                        return true;
                    } catch (_addError) {
                        void _addError;
                        // console.log('Add/Switch error:', _addError);
                        setStatus('❌ Failed to add Hedera Testnet');
                        return false;
                    }
                } else {
                    // Some other error - user may need to manually switch
                    // console.log('Unexpected error during switch:', error);
                    setStatus('⚠️ Please manually switch to Hedera Testnet in MetaMask');
                    return false;
                }
            }
        } catch (_e) {
            void _e;
            // console.log('Network check error:', _e);
            setStatus('❌ Network error');
            return false;
        }
    };

    const validateNetwork = async (): Promise<boolean> => {
        const ethereum = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown>; }; }).ethereum;
        if (!ethereum) {
            setStatus('❌ Metamask not found');
            return false;
        }

        try {
            const chainId = await ethereum.request({ method: 'eth_chainId' }) as string;
            if (chainId !== CONFIG.HEDERA_CHAIN_ID) {
                setStatus('❌ Please switch to Hedera Testnet to continue');
                return false;
            }
            return true;
        } catch {
            setStatus('❌ Network check failed');
            return false;
        }
    };

    const connectWallet = async () => {
        if (!((window as unknown as Record<string, unknown>).ethereum)) {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const isMetaMaskBrowser = /MetaMaskMobile/i.test(navigator.userAgent);

            if (isMobile && !isMetaMaskBrowser) {
                if ((window as any).__mmRedirecting) return;
                (window as any).__mmRedirecting = true;
                setTimeout(() => { (window as any).__mmRedirecting = false; }, 10000);

                setStatus('⏳ Opening MetaMask...');
                const dappUrl = window.location.href.replace(/^https?:\/\//, '');
                window.location.assign(`https://metamask.app.link/dapp/${dappUrl}`);
                return;
            }
            setStatus('❌ Metamask not detected (or loading)');
            return;
        }
        try {
            const accounts = await (window as unknown as { ethereum: { request: (args: { method: string; }) => Promise<string[]>; }; }).ethereum.request({ method: 'eth_requestAccounts' });
            // console.log('Connected accounts:', accounts);
            if (!accounts || !Validators.validateAddress(accounts[0])) {
                setStatus('❌ Invalid account address');
                return;
            }
            setUser(accounts[0]);

            // Check and switch to Hedera Testnet
            const networkOk = await checkAndSwitchNetwork();
            if (!networkOk) {
                setStatus('⚠️ Connected but not on Hedera Testnet');
            }

            setStatus('✅ System Authorized');
        } catch (e) {
            Logger.error('connectWallet', e);
            setStatus('❌ Connection failed - please try again');
        }
    };


    const loadLedger = async (forcedUser?: string) => {
        const targetUser = forcedUser || user;
        const ethereumProvider = (window as unknown as Record<string, unknown>).ethereum;
        if (!ethereumProvider || !targetUser) return;

        setStatus('⏳ Loading ledger...');
        try {
            const provider = new ethers.providers.Web3Provider(ethereumProvider as ethers.providers.ExternalProvider);
            const signer = provider.getSigner();
            const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, signer);

            const countBig = await contract.getMyRecordsCount();
            const count = countBig.toNumber();

            if (count === 0) {
                setRecords([]);
                setStatus('ℹ️ No records found');
                return;
            }

            const results: Array<LedgerRecord> = [];
            const startIdx = Math.max(0, count - 15);

            for (let i = count - 1; i >= startIdx; i--) {
                try {
                    const r = await contract.getMyRecord(i);

                    // Try accessing fields directly
                    const timestamp = r[0] && r[0].toNumber ? r[0].toNumber() : r.timestamp?.toNumber?.() || 0;
                    const version = r[1] && r[1].toNumber ? r[1].toNumber() : r.version?.toNumber?.() || 0;
                    const hash = r[2] || r.originalHash || '';
                    const stealthCID = r[3] || r.stealthCID || '';

                    results.push({
                        index: i,
                        hash: hash,
                        stealthCID: stealthCID,
                        date: new Date(timestamp * 1000).toLocaleString(),
                        version: version
                    });
                } catch (recordErr) {
                    const errMsg = recordErr instanceof Error ? recordErr.message : String(recordErr);
                    Logger.error(`loadLedger - record ${i}: ${errMsg}`, recordErr);
                }
            }

            setRecords(results);
            setStatus('✅ Ledger loaded');
        } catch (e) {
            Logger.error('loadLedger', e);
            setStatus('❌ Failed to load ledger');
            setRecords([]);
        }
    };

    const encryptLocally = async () => {
        if (!user) {
            connectWallet();
            return;
        }

        // Validate network before proceeding
        const onCorrectNetwork = await validateNetwork();
        if (!onCorrectNetwork) return;

        if (!selectedFile) {
            setStatus('⚠️ Please select a file');
            return;
        }
        if (!pass) {
            setStatus('⚠️ Please enter a key phrase');
            return;
        }
        if (!passConfirm) {
            setStatus('⚠️ Please confirm your key phrase');
            return;
        }
        if (pass !== passConfirm) {
            setStatus('❌ Key phrases do not match');
            return;
        }
        if (!Validators.validatePassword(pass)) {
            setStatus('❌ Key phrase must be at least 8 characters');
            return;
        }
        if (!Validators.validateFileSize(selectedFile, CONFIG.MAX_FILE_SIZE)) {
            setStatus('❌ File too large (max 50MB)');
            return;
        }

        setIsEncrypting(true);
        try {
            const hashBuffer = await crypto.subtle.digest('SHA-256', await selectedFile.arrayBuffer());
            const origHash = CryptoUtils.bufferToHex(hashBuffer);
            const encryptedData = await CryptoUtils.encryptFile(selectedFile, pass);

            setSessionData({
                blob: new Blob([new Uint8Array(encryptedData)]),
                name: selectedFile.name,
                orig: origHash,
                cid: "", stealthCID: "",
                txHash: "", blockNum: 0, chainTime: ""
            });
            setStatus('✅ Local seal applied');
            setAnchorStep(2);
        } catch (e) {
            Logger.error('encryptLocally', e);
            setStatus('❌ Encryption failed');
        }
        setIsEncrypting(false);
    };

    const uploadToIPFS = async () => {
        // Validate network before proceeding
        const onCorrectNetwork = await validateNetwork();
        if (!onCorrectNetwork) return;

        if (skipEncryption) {
            setStatus('❌ Cannot upload to IPFS when encryption is skipped');
            setIsMasking(false);
            return;
        }
        if (!sessionData.blob) {
            setStatus('⚠️ No encrypted data to upload');
            return;
        }
        if (sessionData.blob.size === 0) {
            setStatus('❌ Encrypted data is empty - please try again');
            return;
        }
        if (!maskPass) {
            setStatus('⚠️ Mask key required');
            return;
        }
        if (!maskPassConfirm) {
            setStatus('⚠️ Please confirm your mask key');
            return;
        }
        if (maskPass !== maskPassConfirm) {
            setStatus('❌ Mask keys do not match');
            return;
        }
        if (!Validators.validatePassword(maskPass)) {
            setStatus('❌ Mask key must be at least 8 characters');
            return;
        }

        setIsMasking(true);
        setJwtInput('');
        setJwtError('');
        setShowJWTPopup(true);
    };

    const submitJWT = async (jwt: string) => {
        if (!jwt || !Validators.validateJWT(jwt)) {
            setJwtError('Invalid JWT - must be at least 20 characters');
            return;
        }

        setJwtError('');
        setShowJWTPopup(false);
        setJwtInput('');

        try {
            if (!sessionData.blob) {
                throw new Error('No file data available');
            }

            const formData = new FormData();
            formData.append('file', sessionData.blob, `vault_${sessionData.name}.bin`);

            const res = await fetch(CONFIG.PINATA_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${jwt.trim()}`,
                    'Accept': 'application/json'
                },
                body: formData
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`IPFS upload failed: ${res.status} ${res.statusText} - ${errorText}`);
            }

            const data = await res.json();
            if (!data.IpfsHash) {
                throw new Error('No IPFS hash returned from Pinata');
            }

            const stealthCID = await CryptoUtils.encryptString(data.IpfsHash, maskPass);
            setSessionData(prev => ({ ...prev, stealthCID }));
            setStatus('✅ Location masked via IPFS');
            setAnchorStep(3);
        } catch (e) {
            Logger.error('uploadToIPFS', e);
            setStatus(`❌ IPFS upload failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
        setIsMasking(false);
    };

    const skipCloudUpload = () => {
        setSkipEncryption(false);
        setSessionData(prev => ({ ...prev, stealthCID: "hash-only" }));
        setSkipCloud(true);
        setStatus('✅ Cloud upload skipped - ready to anchor hash only');
        setAnchorStep(3);
    };

    const anchorHashOnly = async () => {
        if (!user) {
            connectWallet();
            return;
        }

        // Validate network before proceeding
        const onCorrectNetwork = await validateNetwork();
        if (!onCorrectNetwork) return;

        if (!selectedFile) {
            setStatus('⚠️ Please select a file');
            return;
        }
        if (!Validators.validateFileSize(selectedFile, CONFIG.MAX_FILE_SIZE)) {
            setStatus('❌ File too large (max 50MB)');
            return;
        }

        setIsEncrypting(true);
        try {
            const arrayBuffer = await selectedFile.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const origHash = CryptoUtils.bufferToHex(hashBuffer);
            setSessionData({
                blob: null,
                name: selectedFile.name,
                orig: origHash,
                cid: "",
                stealthCID: "hash-only",
                txHash: "",
                blockNum: 0,
                chainTime: ""
            });
            setSkipEncryption(true);
            setSkipCloud(false);
            setStatus('✅ File hash ready for anchoring');
            setAnchorStep(3);
        } catch (e) {
            Logger.error('anchorHashOnly', e);
            setStatus('❌ Hash generation failed');
        }
        setIsEncrypting(false);
    };

    const anchorToBlockchain = async () => {
        // Validate network before proceeding
        const onCorrectNetwork = await validateNetwork();
        if (!onCorrectNetwork) return;

        if (!sessionData.stealthCID) {
            setStatus('⚠️ No data to anchor');
            return;
        }

        try {
            //console.log('🟡 Anchor to blockchain started');
            const ethereumProvider = (window as unknown as Record<string, unknown>).ethereum;
            if (!ethereumProvider) throw new Error('Ethereum provider not found');

            const provider = new ethers.providers.Web3Provider(ethereumProvider as ethers.providers.ExternalProvider);
            const signer = provider.getSigner();

            // Step 4: Proceed with gas estimation
            const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, signer);

            try {
                //console.log('🟡 Estimating gas...');
                setStatus('⏳ Calculating gas fees...');

                const gasEstimate = await contract.estimateGas.recordIdea(sessionData.orig, sessionData.stealthCID);
                const gasPrice = await provider.getGasPrice();
                const estimatedCost = gasEstimate.mul(gasPrice);

                const gasEstimateNum = gasEstimate.toNumber();
                const gasPriceGwei = ethers.utils.formatUnits(gasPrice, 'gwei');
                const costInHbar = ethers.utils.formatEther(estimatedCost);

                //console.log('✅ GAS ESTIMATION RESULTS:');
                // console.log('  - Gas Limit:', gasEstimateNum.toLocaleString(), 'units');
                //console.log('  - Gas Price:', gasPriceGwei, 'gwei');
                //console.log('  - Total Cost:', costInHbar, 'HBAR');
                //console.log('  - Cost in Wei:', estimatedCost.toString());

                // Show transaction details modal with REAL values
                setTxDetails({
                    fileName: sessionData.name,
                    originalHash: sessionData.orig,
                    stealthCID: sessionData.stealthCID,
                    estimatedGas: gasEstimateNum.toString(),
                    gasPrice: gasPriceGwei,
                    estimatedCost: costInHbar,
                });
                setShowTxDetails(true);
                setStatus('👀 Review transaction details');
            } catch (_gasError) {
                void _gasError;
                setStatus('⏳ Requesting confirmation...');
                setIsAnchoring(true);
                await executeTxSubmission();
            }
        } catch (_e) {
            void _e;
            //console.error('Transaction prep error:', _e);
            setStatus('❌ Failed to prepare transaction');
        }
    };

    const executeTxSubmission = async () => {
        if (!sessionData.stealthCID) {
            setStatus('⚠️ No data to anchor');
            setIsAnchoring(false);
            return;
        }

        try {
            const ethereum = (window as unknown as Record<string, unknown>).ethereum;
            if (!ethereum) throw new Error('MetaMask not found');

            const provider = new ethers.providers.Web3Provider(ethereum);
            const signer = provider.getSigner();
            const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, signer);

            setStatus('⏳ Check MetaMask for confirmation...');

            const tx = await contract.recordIdea(sessionData.orig, sessionData.stealthCID);

            setStatus(`⏳ Mining: ${tx.hash.slice(0, 10)}...`);
            setShowTxDetails(false);

            const receipt = await tx.wait();
            const block = await provider.getBlock(receipt.blockNumber);

            setSessionData(prev => ({
                ...prev,
                txHash: tx.hash,
                blockNum: receipt.blockNumber,
                chainTime: new Date(block.timestamp * 1000).toLocaleString()
            }));

            await loadLedger();
            setShowReceipt(true);
            setStatus('✅ Immutable proof secured');
            setIsAnchoring(false);
        } catch (e) {
            const errorObj = e as Record<string, unknown>;
            const errorMessage = typeof e === 'object' && e !== null
                ? (errorObj.message as string) || (errorObj.reason as string) || (errorObj.error as string) || JSON.stringify(e)
                : String(e);

            let errorMsg = '❌ Transaction failed';
            if (errorMessage?.includes('user rejected')) {
                errorMsg = '⚠️ You rejected the transaction';
            } else if (errorMessage?.includes('insufficient funds')) {
                errorMsg = '❌ Insufficient HBAR for gas';
            } else if (errorMessage?.includes('wrong chain')) {
                errorMsg = '❌ Please switch to Hedera Testnet';
            } else if (errorMessage?.includes('VP: Payment failed') || errorMessage?.includes('transferFrom')) {
                errorMsg = '❌ Token payment failed - check approval and balance';
            } else if (errorMessage?.includes('insufficient allowance')) {
                errorMsg = '❌ Insufficient token approval - please re-approve';
            } else {
                errorMsg += ` - ${errorMessage || 'Unknown error'}`;
            }

            Logger.error('executeTxSubmission', errorMessage);
            setStatus(errorMsg);
            setShowTxDetails(false);
            setIsAnchoring(false);
        }
    };

    const handleDecryptFile = async () => {
        if (!fileToDecrypt || !filePass) {
            setStatus('⚠️ Encrypted file and password required');
            return;
        }
        if (!Validators.validatePassword(filePass)) {
            setStatus('❌ Password must be at least 8 characters');
            return;
        }

        setIsVerifying(true);
        try {
            const decryptedBlob = await CryptoUtils.decryptFile(fileToDecrypt, filePass);
            const decryptedBuffer = await decryptedBlob.arrayBuffer();
            const decryptedBlobForDownload = new Blob([decryptedBuffer]);
            const recoveredName = fileToDecrypt.name.replace(/^vault_/, '').replace(/\.bin$/i, '') || 'decrypted_asset';
            const fileHash = CryptoUtils.bufferToHex(await crypto.subtle.digest('SHA-256', decryptedBuffer));
            setDecryptedResult({ blob: decryptedBlobForDownload, name: recoveredName, hash: fileHash });
            setStatus('✅ File decrypted successfully');
        } catch (e) {
            Logger.error('handleDecryptFile', e);
            setStatus('❌ Decryption failed - invalid password or corrupted file');
            setDecryptedResult(null);
        }
        setIsVerifying(false);
    };

    const handleUnmaskCID = async () => {
        if (!stealthCIDInput || !cidMaskKey) {
            setStatus('⚠️ Stealth CID and mask key required');
            return;
        }
        if (!Validators.validatePassword(cidMaskKey)) {
            setStatus('❌ Mask key must be at least 8 characters');
            return;
        }

        setIsVerifying(true);
        try {
            const revealed = await CryptoUtils.decryptString(stealthCIDInput, cidMaskKey);
            if (!Validators.validateCID(revealed)) {
                throw new Error('Invalid CID');
            }
            setUnmaskedCID(revealed);
            setStatus('✅ CID unmasked');
        } catch (e) {
            Logger.error('handleUnmaskCID', e);
            setStatus('❌ Unmasking failed - invalid key or corrupted CID');
            setUnmaskedCID('');
        }
        setIsVerifying(false);
    };

    const downloadFromCID = async () => {
        if (!unmaskedCID) {
            setStatus('⚠️ No CID to download');
            return;
        }

        setIsVerifying(true);
        try {
            const gatewayUrl = `${CONFIG.PINATA_GATEWAY_URL}/${unmaskedCID}`;
            const res = await fetch(gatewayUrl);
            if (!res.ok) {
                throw new Error(`Download failed: ${res.status} ${res.statusText}`);
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `vault_file_${Date.now()}.bin`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setStatus('✅ File downloaded from IPFS');
        } catch (e) {
            Logger.error('downloadFromCID', e);
            setStatus(`❌ Download failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
        setIsVerifying(false);
    };

    const downloadAudit = () => {
        const auditPayload = {
            fileName: sessionData.name || 'unknown',
            originalHash: sessionData.orig,
            stealthCID: sessionData.stealthCID,
            transactionHash: sessionData.txHash,
            blockNumber: sessionData.blockNum,
            chainTime: sessionData.chainTime,
            mode: skipEncryption ? 'hash-only' : skipCloud ? 'hash-only' : 'masked',
            wallet: user || 'unknown',
            timestamp: new Date().toISOString(),
        };
        const auditBlob = new Blob([JSON.stringify(auditPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(auditBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `vault_audit_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setStatus('✅ Audit report downloaded');
    };

    const resetAnchor = () => {
        setAnchorStep(1);
        setPass('');
        setPassConfirm('');
        setMaskPass('');
        setMaskPassConfirm('');
        setSelectedFile(null);
        setSessionData({ blob: null, name: "", orig: "", cid: "", stealthCID: "", txHash: "", blockNum: 0, chainTime: "" });
        setShowReceipt(false);
        setSkipCloud(false);
        setSkipEncryption(false);
    };

    return (
        <div className="relative min-h-screen w-full flex flex-col justify-start items-center pt-24 md:pt-32 px-4 md:p-6 pb-16 md:pb-6 bg-linear-to-b from-slate-950 to-slate-900 overflow-x-hidden" role="main">
            {status && (
                <div className="fixed top-4 md:top-24 left-1/2 -translate-x-1/2 z-50 px-4 md:px-6 py-2 md:py-3 bg-indigo-600/90 backdrop-blur-md text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-full shadow-2xl shadow-indigo-600/40 animate-pulse transition-all duration-300 max-w-xs mx-auto text-center" role="alert">
                    {status}
                </div>
            )}

            {copiedNotification && (
                <div className="fixed bottom-20 md:bottom-24 left-1/2 -translate-x-1/2 z-50 px-3 md:px-4 py-1.5 md:py-2 bg-emerald-600/90 backdrop-blur-md text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-full shadow-2xl shadow-emerald-600/40 animate-pulse transition-all duration-300" role="alert">
                    Copied!
                </div>
            )}

            {/* Transaction Details Modal */}
            {showTxDetails && txDetails && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-end md:items-center justify-center p-0 md:p-4">
                    <div className="bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 border border-indigo-500/30 rounded-t-3xl md:rounded-2xl shadow-2xl w-full md:max-w-md md:w-full p-6 space-y-4 md:space-y-6 max-h-[90vh] md:max-h-none overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg md:text-xl font-bold text-white">Confirm Transaction</h3>
                            <button
                                onClick={() => {
                                    setShowTxDetails(false);
                                    setIsAnchoring(false);
                                    setStatus('⚠️ Transaction cancelled');
                                }}
                                className="text-slate-400 hover:text-white text-2xl leading-none p-2 -mr-2"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Network & Contract Info */}
                        <div className="space-y-2 pt-3 md:pt-4 border-t border-slate-700">
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-slate-400 text-xs md:text-sm">Network</span>
                                <span className="text-white font-semibold text-xs md:text-base text-right">{CONFIG.HEDERA_NETWORK_NAME}</span>
                            </div>
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-slate-400 text-xs md:text-sm">Contract</span>
                                <span className="text-white font-mono text-[9px] md:text-xs truncate max-w-xs">{CONFIG.CONTRACT_ADDRESS.slice(0, 10)}...{CONFIG.CONTRACT_ADDRESS.slice(-8)}</span>
                            </div>
                        </div>

                        {/* File Details */}
                        <div className="space-y-2 md:space-y-3 pt-3 md:pt-4 border-t border-slate-700">
                            <h4 className="text-slate-300 font-semibold text-xs md:text-sm">File Details</h4>
                            <div className="space-y-2 pl-3 border-l-2 border-indigo-500/50">
                                <div>
                                    <p className="text-slate-400 text-[9px] md:text-xs">File Name</p>
                                    <p className="text-white font-mono text-xs md:text-sm truncate">{txDetails.fileName}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[9px] md:text-xs">Original Hash</p>
                                    <p className="text-white font-mono text-[8px] md:text-xs break-all">{txDetails.originalHash}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[9px] md:text-xs">Stealth CID</p>
                                    <p className="text-white font-mono text-[8px] md:text-xs break-all">{txDetails.stealthCID}</p>
                                </div>
                            </div>
                        </div>

                        {/* Gas & Cost Details */}
                        <div className="space-y-2 md:space-y-3 pt-3 md:pt-4 border-t border-slate-700 bg-slate-800/50 rounded-lg p-3 md:p-4">
                            <h4 className="text-slate-300 font-semibold text-xs md:text-sm">💰 Transaction Cost Breakdown</h4>

                            {/* Gas Limit */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-center gap-2">
                                    <span className="text-slate-400 text-[9px] md:text-xs font-medium">Gas Limit</span>
                                    <span className="text-indigo-300 font-mono font-bold text-[9px] md:text-xs">{txDetails.estimatedGas !== '0' ? parseInt(txDetails.estimatedGas).toLocaleString() : 'Calculating...'} units</span>
                                </div>
                                <div className="h-0.5 bg-slate-700 rounded"></div>
                            </div>

                            {/* Gas Price */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-center gap-2">
                                    <span className="text-slate-400 text-[9px] md:text-xs font-medium">Gas Price</span>
                                    <span className="text-cyan-300 font-mono font-bold text-[9px] md:text-xs">{parseFloat(txDetails.gasPrice).toFixed(3)} gwei</span>
                                </div>
                                <div className="h-0.5 bg-slate-700 rounded"></div>
                            </div>

                            {/* Total Cost */}
                            <div className="pt-2 flex flex-col md:flex-row md:justify-between md:items-center gap-2 bg-indigo-600/10 rounded p-2 md:p-3 border border-indigo-500/20">
                                <span className="text-slate-200 font-semibold text-[9px] md:text-sm">Total Fee</span>
                                <div className="text-right">
                                    <span className="text-indigo-300 font-mono font-bold text-base md:text-lg block">{parseFloat(txDetails.estimatedCost).toFixed(6)} HBAR</span>
                                    <span className="text-slate-400 text-[8px] md:text-xs">(Hedera Testnet)</span>
                                </div>
                            </div>

                            <p className="text-slate-400 text-[8px] md:text-xs pt-2 italic">
                                These are estimates based on current network conditions. Actual gas may vary.
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                            <button
                                onClick={() => {
                                    setShowTxDetails(false);
                                    setIsAnchoring(false);
                                    setStatus('⚠️ Transaction cancelled');
                                }}
                                className="flex-1 px-3 md:px-4 py-3 md:py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold text-sm md:text-base transition-colors min-h-[44px] md:min-h-auto"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    await executeTxSubmission();
                                }}
                                disabled={isAnchoring}
                                className="flex-1 px-3 md:px-4 py-3 md:py-2 rounded-lg bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 text-white font-semibold text-sm md:text-base transition-all min-h-[44px] md:min-h-auto"
                            >
                                {isAnchoring ? '⏳ Confirming...' : '✓ Confirm'}
                            </button>
                        </div>

                        <p className="text-slate-400 text-[8px] md:text-xs text-center">
                            MetaMask will open for you to confirm and pay the gas fee.
                        </p>
                    </div>
                </div>
            )}


            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 w-full p-4 md:p-8 flex justify-between items-center z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
                <div className="flex items-center gap-2 md:gap-4">
                    <div className="w-8 md:w-10 h-8 md:h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
                        <Icon name="shield" size={20} className="text-white md:text-base" />
                    </div>
                    <div className="hidden sm:block">
                        <h1 className="text-base md:text-lg font-black text-white">VaultProtocol</h1>
                        <p className="text-[8px] md:text-[10px] text-slate-500">Stealth Notary</p>
                    </div>
                </div>

                {/* Mobile menu button */}
                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="md:hidden p-2 text-slate-300 hover:text-white text-2xl"
                >
                    {mobileMenuOpen ? '✕' : '☰'}
                </button>

                {/* Desktop navigation */}
                <div className="hidden md:flex gap-2">
                    <button onClick={() => { setView('anchor'); setMobileMenuOpen(false); }} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${view === 'anchor' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}>
                        Anchor
                    </button>
                    <button onClick={() => { setView('verify'); setMobileMenuOpen(false); }} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${view === 'verify' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}>
                        Verify
                    </button>
                    <button onClick={() => { setView('ledger'); setMobileMenuOpen(false); }} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${view === 'ledger' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}>
                        Ledger
                    </button>
                    <button onClick={connectWallet} className="ml-4 border border-slate-700 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition text-slate-300 min-h-[44px]">
                        <Icon name="unlock" size={14} />
                        {user ? `${user.slice(0, 6)}...` : 'Connect'}
                    </button>
                </div>
            </nav>

            {/* Mobile navigation menu */}
            {mobileMenuOpen && (
                <div className="fixed top-16 left-0 right-0 z-20 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 md:hidden">
                    <div className="flex flex-col gap-3 p-4">
                        <button
                            onClick={() => { setView('anchor'); setMobileMenuOpen(false); }}
                            className={`px-4 py-3 rounded-lg text-sm font-black uppercase tracking-widest transition min-h-[48px] ${view === 'anchor' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
                        >
                            Anchor
                        </button>
                        <button
                            onClick={() => { setView('verify'); setMobileMenuOpen(false); }}
                            className={`px-4 py-3 rounded-lg text-sm font-black uppercase tracking-widest transition min-h-[48px] ${view === 'verify' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
                        >
                            Verify
                        </button>
                        <button
                            onClick={() => { setView('ledger'); setMobileMenuOpen(false); }}
                            className={`px-4 py-3 rounded-lg text-sm font-black uppercase tracking-widest transition min-h-[48px] ${view === 'ledger' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
                        >
                            Ledger
                        </button>
                        <button
                            onClick={() => { connectWallet(); setMobileMenuOpen(false); }}
                            className="border border-slate-700 px-4 py-3 rounded-lg text-sm font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition text-slate-300 min-h-[48px]"
                        >
                            <Icon name="unlock" size={16} />
                            {user ? `${user.slice(0, 6)}...` : 'Connect'}
                        </button>
                    </div>
                </div>
            )}

            {view === 'anchor' && !showReceipt && (
                <div className="w-full max-w-2xl px-0 md:px-4 my-auto">
                    <div className="flex justify-center gap-1 md:gap-2 mb-6 md:mb-10 flex-wrap">
                        {[1, 2, 3].map(step => (
                            <div key={step} className={`h-2 flex-1 max-w-xs ${anchorStep >= step ? 'bg-indigo-600' : 'bg-slate-800'} rounded-full transition`} />
                        ))}
                    </div>

                    <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl md:rounded-[2.5rem] p-6 md:p-12 text-center">
                        {anchorStep === 1 && (
                            <div className="space-y-4 md:space-y-6">
                                <Icon name="file" size={48} className="mx-auto text-indigo-400 md:size-[60px]" />
                                <h2 className="text-xl md:text-2xl font-bold text-white">Step 1: Seal Asset</h2>

                                <input
                                    type="file"
                                    id="file-upload"
                                    className="hidden"
                                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                />
                                <label
                                    htmlFor="file-upload"
                                    className="w-full bg-slate-950/50 border-2 border-dashed border-slate-700 rounded-2xl p-6 md:p-8 text-xs md:text-sm text-slate-400 block cursor-pointer hover:border-indigo-500/50 hover:text-indigo-400 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50 min-h-[100px] flex items-center justify-center"
                                >
                                    {selectedFile ? `📄 ${selectedFile.name}` : "Click to select file"}
                                </label>

                                <input
                                    type="password"
                                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl p-4 md:p-4 text-sm text-white outline-none focus:border-indigo-500/50 transition-all focus:ring-2 focus:ring-indigo-500/50 min-h-[48px]"
                                    placeholder="Master Key Phrase (8+ chars)"
                                    value={pass}
                                    onChange={(e) => setPass(e.target.value)}
                                />

                                <input
                                    type="password"
                                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl p-4 md:p-4 text-sm text-white outline-none focus:border-indigo-500/50 transition-all focus:ring-2 focus:ring-indigo-500/50 min-h-[48px]"
                                    placeholder="Confirm Master Key Phrase"
                                    value={passConfirm}
                                    onChange={(e) => setPassConfirm(e.target.value)}
                                />

                                <p className="text-slate-300 text-[9px] md:text-xs bg-slate-800/50 p-3 rounded-lg border border-slate-700">💡 <strong>Tip:</strong> You can skip the password and use <strong>'Chain Hash Only'</strong> to anchor without encryption</p>

                                <button
                                    onClick={encryptLocally}
                                    disabled={isEncrypting}
                                    className="w-full bg-indigo-600 py-3 md:py-4 rounded-3xl text-xs md:text-[11px] font-black uppercase tracking-widest text-white hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 min-h-[48px]"
                                >
                                    {isEncrypting ? (<><Icon name="loader2" className="animate-spin" size={16} /> Encrypting...</>) : "Encrypt and Back Up"}
                                </button>

                                <button
                                    onClick={anchorHashOnly}
                                    disabled={isEncrypting}
                                    className="w-full bg-slate-800 hover:bg-slate-700 py-3 md:py-4 rounded-2xl text-xs md:text-[11px] font-black uppercase tracking-widest text-slate-300 transition-all border border-slate-700 flex items-center justify-center gap-2 min-h-[48px]"
                                >
                                    {isEncrypting ? (<><Icon name="loader2" className="animate-spin" size={16} /> Hashing...</>) : (<><Icon name="bolt" size={16} />Chain Hash Only</>)}
                                </button>
                            </div>
                        )}

                        {anchorStep === 2 && (
                            <div className="space-y-4 md:space-y-6">
                                <Icon name="cloud" size={48} className="mx-auto text-indigo-400 md:size-[48px]" />
                                <h2 className="text-xl md:text-2xl font-bold text-white">Step 2: Back Up</h2>
                                <p className="text-slate-400 text-xs md:text-sm">Upload to cloud or anchor hash only</p>

                                <input
                                    type="password"
                                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl p-4 md:p-4 text-sm text-white outline-none focus:border-indigo-500/50 transition-all focus:ring-2 focus:ring-indigo-500/50 min-h-[48px]"
                                    placeholder="Location Mask Key (8+ chars)"
                                    value={maskPass}
                                    onChange={(e) => setMaskPass(e.target.value)}
                                />

                                <input
                                    type="password"
                                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl p-4 md:p-4 text-sm text-white outline-none focus:border-indigo-500/50 transition-all focus:ring-2 focus:ring-indigo-500/50 min-h-[48px]"
                                    placeholder="Confirm Location Mask Key"
                                    value={maskPassConfirm}
                                    onChange={(e) => setMaskPassConfirm(e.target.value)}
                                />

                                <button
                                    onClick={uploadToIPFS}
                                    disabled={isMasking}
                                    className="w-full bg-indigo-600 py-3 md:py-4 rounded-2xl text-xs md:text-[11px] font-black uppercase tracking-widest text-white hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 min-h-[48px]"
                                >
                                    {isMasking ? (<><Icon name="loader2" className="animate-spin" size={16} /> Uploading...</>) : "Upload to IPFS"}
                                </button>

                                {/* JWT Input Popup */}
                                {showJWTPopup && (
                                    <div className="mt-4 p-4 bg-slate-800/50 border border-amber-500/30 rounded-xl space-y-4 animate-in slide-in-from-top-2 duration-300">
                                        <div className="flex items-start gap-3">
                                            <span className="text-amber-400 text-lg mt-0.5 flex-shrink-0">🔐</span>
                                            <div className="flex-1">
                                                <h4 className="text-amber-200 font-semibold text-sm mb-1">Pinata JWT Required</h4>
                                                <p className="text-amber-300/80 text-xs mb-3">
                                                    Your JWT token is used only for this upload and is never stored or logged.
                                                    Get your JWT from <a href="https://app.pinata.cloud/developers/api-keys" target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200 underline">Pinata Dashboard</a>.
                                                </p>
                                                <input
                                                    type="password"
                                                    value={jwtInput}
                                                    onChange={(e) => setJwtInput(e.target.value)}
                                                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                                    autoComplete="off"
                                                    spellCheck="false"
                                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono min-h-[48px]"
                                                    autoFocus
                                                />
                                                {jwtError && (
                                                    <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                                                        <span>❌</span> {jwtError}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => submitJWT(jwtInput)}
                                                disabled={!jwtInput.trim()}
                                                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold py-3 px-3 rounded-lg transition-all min-h-[48px]"
                                            >
                                                Upload to IPFS
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowJWTPopup(false);
                                                    setIsMasking(false);
                                                    setJwtInput('');
                                                }}
                                                className="px-3 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold rounded-lg transition-all min-h-[48px]"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="relative flex items-center gap-3">
                                    <div className="flex-1 h-px bg-slate-700"></div>
                                    <span className="text-xs text-slate-500 uppercase font-bold">or</span>
                                    <div className="flex-1 h-px bg-slate-700"></div>
                                </div>

                                <button
                                    onClick={skipCloudUpload}
                                    className="w-full bg-slate-800 hover:bg-slate-700 py-3 md:py-4 rounded-2xl text-xs md:text-[11px] font-black uppercase tracking-widest text-slate-300 transition-all border border-slate-700 flex items-center justify-center gap-2 min-h-[48px]"
                                >
                                    <Icon name="bolt" size={16} /> Skip - Chain Hash Only
                                </button>
                            </div>
                        )}

                        {anchorStep === 3 && (
                            <div className="space-y-4 md:space-y-6">
                                <Icon name="lock" size={48} className="mx-auto text-indigo-400 md:size-[60px]" />
                                <h2 className="text-xl md:text-2xl font-bold text-white">Step 3: Anchor Proof</h2>
                                <p className="text-slate-400 text-xs md:text-sm">
                                    Ready to record {(skipEncryption || skipCloud) ? 'hash-only' : 'masked'} proof on blockchain
                                </p>

                                <button
                                    onClick={anchorToBlockchain}
                                    disabled={isAnchoring}
                                    className="w-full bg-indigo-600 py-3 md:py-4 rounded-2xl text-xs md:text-[11px] font-black uppercase tracking-widest text-white hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 min-h-[48px]"
                                >
                                    {isAnchoring ? (<><Icon name="loader2" className="animate-spin" size={16} /> Anchoring...</>) : "Anchor to Blockchain"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showReceipt && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-4">
                    <div className="w-full md:max-w-xl bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-t-3xl md:rounded-[2.5rem] p-6 md:p-12 text-center max-h-[90vh] md:max-h-none overflow-y-auto">
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Stealth Anchor Complete</h2>
                        <p className="text-slate-500 text-[8px] md:text-xs font-medium mb-8 md:mb-10 uppercase tracking-widest">Confirmed on Hedera Testnet</p>

                        <CopyBox label="Asset Hash" value={sessionData.orig} color="emerald" onCopy={() => setCopiedNotification(true)} />
                        <CopyBox label="Stealth CID" value={sessionData.stealthCID} color="indigo" onCopy={() => setCopiedNotification(true)} />
                        <CopyBox label="Transaction Hash" value={sessionData.txHash} color="slate" onCopy={() => setCopiedNotification(true)} />

                        <div className="grid grid-cols-2 gap-3 md:gap-4 mt-8 md:mt-10">
                            <div className="p-3 md:p-4 bg-slate-950/50 border border-slate-800 rounded-lg">
                                <p className="text-[9px] md:text-[10px] text-slate-500 mb-1">Block</p>
                                <p className="text-base md:text-lg font-mono text-indigo-400">{sessionData.blockNum}</p>
                            </div>
                            <div className="p-3 md:p-4 bg-slate-950/50 border border-slate-800 rounded-lg">
                                <p className="text-[9px] md:text-[10px] text-slate-500 mb-1">Time</p>
                                <p className="text-xs md:text-xs font-mono text-indigo-400 line-clamp-2">{sessionData.chainTime}</p>
                            </div>
                        </div>

                        <div className="grid gap-2 md:gap-3 mt-8 md:mt-8">
                            <button
                                onClick={downloadAudit}
                                className="w-full bg-emerald-600 py-3 rounded-lg text-xs md:text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500 transition flex items-center justify-center gap-2 min-h-[48px]"
                            >
                                <Icon name="download" size={16} /> Download Audit
                            </button>
                            <button
                                onClick={resetAnchor}
                                className="w-full bg-indigo-600 py-3 rounded-lg text-xs md:text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-500 transition min-h-[48px]"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {view === 'verify' && (
                <div className="w-full max-w-2xl px-0 md:px-4 my-auto">
                    <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl md:rounded-[2.5rem] p-6 md:p-10">
                        <div className="flex gap-2 mb-6 md:mb-8 bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800/50">
                            <button
                                onClick={() => setVerifyTab('decrypt')}
                                className={`flex-1 py-2 rounded-xl text-xs md:text-[10px] font-black uppercase transition min-h-[44px] ${verifyTab === 'decrypt' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                            >
                                Decrypt
                            </button>
                            <button
                                onClick={() => setVerifyTab('unmask')}
                                className={`flex-1 py-2 rounded-xl text-xs md:text-[10px] font-black uppercase transition min-h-[44px] ${verifyTab === 'unmask' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                            >
                                Unmask
                            </button>
                        </div>

                        {verifyTab === 'decrypt' && (
                            <div className="space-y-4">
                                <input
                                    type="file"
                                    id="decrypt-file"
                                    className="hidden"
                                    onChange={(e) => setFileToDecrypt(e.target.files?.[0] || null)}
                                />
                                <label
                                    htmlFor="decrypt-file"
                                    className="w-full bg-slate-950/50 border-2 border-dashed border-slate-700 rounded-lg p-6 text-xs md:text-sm text-slate-400 block cursor-pointer hover:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/50 min-h-[100px] flex items-center justify-center"
                                >
                                    {fileToDecrypt ? `📄 ${fileToDecrypt.name}` : "Select encrypted file"}
                                </label>
                                <input
                                    type="password"
                                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/50 min-h-[48px]"
                                    placeholder="Password"
                                    value={filePass}
                                    onChange={(e) => setFilePass(e.target.value)}
                                />
                                <button
                                    onClick={handleDecryptFile}
                                    disabled={isVerifying}
                                    className="w-full bg-indigo-600 py-3 rounded-lg text-xs md:text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
                                >
                                    {isVerifying ? (<><Icon name="loader2" className="animate-spin" size={16} /> Decrypting...</>) : "Decrypt File"}
                                </button>
                                {decryptedResult && (
                                    <div className="mt-4 p-4 bg-slate-950/60 border border-slate-800 rounded-lg">
                                        <p className="text-[9px] md:text-[10px] uppercase text-slate-500 mb-2">Decrypted asset</p>
                                        <p className="font-mono text-xs md:text-[11px] text-indigo-300 truncate">{decryptedResult.name}</p>
                                        <p className="text-[9px] md:text-[10px] text-slate-400 mt-2">Hash: {decryptedResult.hash.slice(0, 30)}...</p>
                                        <a
                                            href={URL.createObjectURL(decryptedResult.blob)}
                                            download={decryptedResult.name}
                                            className="mt-3 inline-flex items-center justify-center w-full bg-emerald-600 py-3 rounded-lg text-xs md:text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500 gap-2 min-h-[48px]"
                                        >
                                            <Icon name="download" size={16} /> Download Decrypted File
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}

                        {verifyTab === 'unmask' && (
                            <div className="space-y-4">
                                <input
                                    type="text"
                                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/50 min-h-[48px]"
                                    placeholder="Stealth CID (encrypted)"
                                    value={stealthCIDInput}
                                    onChange={(e) => setStealthCIDInput(e.target.value)}
                                />
                                <input
                                    type="password"
                                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/50 min-h-[48px]"
                                    placeholder="Mask Key"
                                    value={cidMaskKey}
                                    onChange={(e) => setCidMaskKey(e.target.value)}
                                />
                                <button
                                    onClick={handleUnmaskCID}
                                    disabled={isVerifying}
                                    className="w-full bg-indigo-600 py-3 rounded-lg text-xs md:text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
                                >
                                    {isVerifying ? (<><Icon name="loader2" className="animate-spin" size={16} /> Unmasking...</>) : "Unmask CID"}
                                </button>
                                {unmaskedCID && (
                                    <div className="space-y-3">
                                        <CopyBox label="Revealed CID" value={unmaskedCID} onCopy={() => setCopiedNotification(true)} />
                                        <button
                                            onClick={downloadFromCID}
                                            disabled={isVerifying}
                                            className="w-full bg-emerald-600 py-3 rounded-lg text-xs md:text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
                                        >
                                            {isVerifying ? (<><Icon name="loader2" className="animate-spin" size={16} /> Downloading...</>) : (<><Icon name="download" size={16} /> Download from IPFS</>)}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {view === 'ledger' && (
                <div className="w-full max-w-4xl px-0 md:px-4 mb-auto">
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 md:mb-8 text-center">System Ledger</h2>
                    <div className="space-y-3 md:space-y-4">
                        {records.length === 0 ? (
                            <p className="text-center text-slate-400">No records found</p>
                        ) : (
                            records.map((record, i) => (
                                <div key={i} className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
                                    <p className="text-[9px] md:text-[10px] text-slate-500 uppercase mb-2">Record #{record.index}</p>
                                    <CopyBox label="Hash" value={record.hash} onCopy={() => setCopiedNotification(true)} />
                                    <CopyBox label="Stealth CID" value={record.stealthCID} onCopy={() => setCopiedNotification(true)} />
                                    <p className="text-[9px] md:text-[10px] text-slate-400 mt-2">{record.date}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 w-full text-center pointer-events-none py-2 md:py-0">
                <p className="text-[8px] md:text-[9px] text-slate-600 uppercase tracking-[0.2em] md:tracking-[0.3em] font-bold">
                    VaultProtocol • 2026
                </p>
            </div>
        </div>
    );
}

export default App;