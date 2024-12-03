import { useAccount,  useConnect, useDisconnect } from 'wagmi'
import { useWalletClient } from 'wagmi'
import { useEffect, useState } from 'react';
// import { 
//   privateKeyToAccount, generatePrivateKey
// } from "viem/accounts";

// const privateKey = generatePrivateKey();
// const account2 = privateKeyToAccount(`${privateKey}`);
import { createNexusClient, createBicoPaymasterClient } from "@biconomy/sdk";
import { baseSepolia } from "viem/chains"; 
import { http, parseEther } from "viem";
const chainId = 84532
const bundlerUrl = `https://bundler.biconomy.io/api/v3/${chainId}/${import.meta.env.VITE_BUNDLER_PAYMASTER_KEY}`;
const paymasterUrl = `https://paymaster.biconomy.io/api/v2/${chainId}/${import.meta.env.VITE_PAYMASTER_BICONOMY_KEY}`; 
console.log({bundlerUrl, paymasterUrl})

function App() {
  const account = useAccount()
  const {data: walletClient} = useWalletClient();
  console.log({account})
  const { connectors, connect, status, error } = useConnect()
  const { disconnect } = useDisconnect()
  const [txHashes, setTxHashes] = useState([]);
  const [nexusClient, setNexusClient] = useState([]);

  const setClient = async (account:any) => {
    const c = await createNexusClient({
      signer: account,
      chain: baseSepolia,
      transport: http(),
      bundlerTransport: http(bundlerUrl),
      paymaster: createBicoPaymasterClient({paymasterUrl})
    })
    setNexusClient(c)
  };
  
  useEffect(() => {
    setClient(walletClient)
  }, [walletClient]); // Empty dependency array means it runs only once when the component mounts

  
  const handleGaslessTransaction = async () => {
    const hash = await nexusClient.sendTransaction({ calls:  
    [
      {
      to : '0xf5715961C550FC497832063a98eA34673ad7C816', value: parseEther('0')}] },
    ); 
    console.log("Transaction hash: ", hash) 
    const receipt = await nexusClient.waitForTransactionReceipt({ hash });  
    setTxHashes(txHashes.concat(receipt.transactionHash))
    console.log("Transaction receipt: ", { receipt})
  };
  
  return (
    <>
      <div>
        <h2>Account</h2>

        <div>
          status: {account.status}
          <br />
          addresses: {JSON.stringify(account.addresses)}
          <br />
          chainId: {account.chainId}
        </div>

        {account.status === 'connected' && (
          <button type="button" onClick={() => disconnect()}>
            Disconnect
          </button>
        )}
        <h5>Txs</h5>
          <ul>
            {
              txHashes.map(tx => {
                console.log('**txhashes', tx)
                return (<li>https://sepolia.basescan.org/tx/{tx}</li>)
              })
            }
          </ul>

      </div>

      <div>
        <h2>Connect</h2>
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            type="button"
          >
            {connector.name}
          </button>
        ))}
        <div>{status}</div>
        <div>{error?.message}</div>
      </div>
      <div>
        <button
          onClick={handleGaslessTransaction}
        >
          Send Gasless transaction
        </button>
      </div>
    </>
  )
}

export default App
