import { useState, useCallback } from "react";
import CoinbaseWalletSDK from "@coinbase/wallet-sdk";

type WalletType = "metamask" | "coinbase" | null;

export interface WalletState {
  walletType: WalletType;
  address: string | null;
  chainId: number | null;
  networkName: string | null;
  isConnecting: boolean;
  error: string | null;
  connectMetaMask: () => Promise<void>;
  connectCoinbase: () => Promise<void>;
}

const SUPPORTED_CHAINS: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
};

export function useWallet(): WalletState {
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [networkName, setNetworkName] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnected = (wType: WalletType, account: string, chainIdHex: string) => {
    const parsedChainId = parseInt(chainIdHex, 16);
    setWalletType(wType);
    setAddress(account);
    setChainId(parsedChainId);
    setNetworkName(SUPPORTED_CHAINS[parsedChainId] ?? `Chain ${parsedChainId}`);
    setError(null);
  };

  const connectMetaMask = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const anyWindow = window as any;
      const provider = anyWindow.ethereum;
      if (!provider) {
        setError("MetaMask not found. Please install MetaMask.");
        return;
      }

      const accounts: string[] = await provider.request({
        method: "eth_requestAccounts",
      });

      const chainIdHex: string = await provider.request({
        method: "eth_chainId",
      });

      if (!accounts || accounts.length === 0) {
        setError("No accounts returned from MetaMask.");
        return;
      }

      handleConnected("metamask", accounts[0], chainIdHex);
    } catch (err: any) {
      console.error("MetaMask connect error", err);
      setError(err?.message || "Failed to connect MetaMask.");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const connectCoinbase = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const coinbase = new CoinbaseWalletSDK({
        appName: "PingPoint",
        appLogoUrl: "",
      });

      const ethereum = coinbase.makeWeb3Provider();

      const accounts: string[] = await ethereum.request({
        method: "eth_requestAccounts",
      }) as string[];

      const chainIdHex: string = await ethereum.request({
        method: "eth_chainId",
      }) as string;

      if (!accounts || accounts.length === 0) {
        setError("No accounts returned from Coinbase Wallet.");
        return;
      }

      handleConnected("coinbase", accounts[0], chainIdHex);
    } catch (err: any) {
      console.error("Coinbase connect error", err);
      setError(err?.message || "Failed to connect Coinbase Wallet.");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  return {
    walletType,
    address,
    chainId,
    networkName,
    isConnecting,
    error,
    connectMetaMask,
    connectCoinbase,
  };
}
