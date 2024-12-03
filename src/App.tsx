import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { 
  privateKeyToAccount, generatePrivateKey
} from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(`${privateKey}`);
import { createNexusClient, createBicoPaymasterClient } from "@biconomy/sdk";
import { baseSepolia } from "viem/chains"; 
import { http, parseEther } from "viem";
const chainId = 84532
const bundlerUrl = `https://bundler.biconomy.io/api/v3/${chainId}/${import.meta.env.VITE_BUNDLER_PAYMASTER_KEY}`;
const paymasterUrl = `https://paymaster.biconomy.io/api/v2/${chainId}/${import.meta.env.VITE_PAYMASTER_BICONOMY_KEY}`; 
console.log({bundlerUrl, paymasterUrl})

const nexusClient = await createNexusClient({
    signer: account,
    chain: baseSepolia,
    transport: http(),
    bundlerTransport: http(bundlerUrl),
    paymaster: createBicoPaymasterClient({paymasterUrl})
});

const handleGaslessTransaction = async () => {
  const hash = await nexusClient.sendTransaction({ calls:  
  [
    {
    to : '0xf5715961C550FC497832063a98eA34673ad7C816', value: parseEther('0')}] },
  ); 
  console.log("Transaction hash: ", hash) 
  const receipt = await nexusClient.waitForTransactionReceipt({ hash });  
  console.log("Transaction receipt: ", { receipt})
};

function App() {
  // const account = useAccount()
  const { connectors, connect, status, error } = useConnect()
  const { disconnect } = useDisconnect()

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
