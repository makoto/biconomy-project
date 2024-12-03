import { useAccount,  useConnect, useDisconnect } from 'wagmi'

import { useWalletClient } from 'wagmi'
import { useEffect, useState } from 'react';
import { 
  privateKeyToAccount, generatePrivateKey
} from "viem/accounts";
import { SmartSessionMode } from "@rhinestone/module-sdk/module"

// const privateKey = generatePrivateKey();
// const account2 = privateKeyToAccount(`${privateKey}`);
import {
  createBicoPaymasterClient, createNexusClient, toSmartSessionsValidator, smartSessionCreateActions,
  smartSessionUseActions, CreateSessionDataParams, SessionData,
  createNexusSessionClient
} from "@biconomy/sdk";
import { baseSepolia } from "viem/chains"; 
import { Hex, encodeFunctionData, parseEther, http } from "viem";

const chainId = 84532
const bundlerUrl = `https://bundler.biconomy.io/api/v3/${chainId}/${import.meta.env.VITE_BUNDLER_PAYMASTER_KEY}`;
const paymasterUrl = `https://paymaster.biconomy.io/api/v2/${chainId}/${import.meta.env.VITE_PAYMASTER_BICONOMY_KEY}`; 
const sessionOwner = privateKeyToAccount(generatePrivateKey())
console.log({bundlerUrl, paymasterUrl, sessionOwner})
const CONTRACT_ADDRESS = "0x017845e4518db01efcafd7acb192af924b432d66"
function App() {
  const account = useAccount()
  const {data: walletClient} = useWalletClient();
  console.log({account})
  const { connectors, connect, status, error } = useConnect()
  const { disconnect } = useDisconnect()
  const [txHashes, setTxHashes] = useState([]);
  const [nexusClient, setNexusClient] = useState();
  const [nexusSessionClient, setNexusSessionClient] = useState();
  const [createSessionsResponse, setCreateSessionsResponse] = useState();
  const [sessionData, setSessionData] =  useState();

  const setClient = async (account:any) => {
    const c = await createNexusClient({
      signer: account,
      chain: baseSepolia,
      transport: http(),
      bundlerTransport: http(bundlerUrl),
      paymaster: createBicoPaymasterClient({paymasterUrl})
    })

    setNexusClient(c)
    const compressedSessionData = localStorage.getItem(`compressedSessionData:${c.account.address}`) as SessionData
    setSessionData(JSON.parse(compressedSessionData))
  };
  
  useEffect(() => {
    setClient(walletClient)
  }, [walletClient]); // Empty dependency array means it runs only once when the component mounts
  console.log({nexusClient, nexusSessionClient,createSessionsResponse, sessionData})
  console.log(nexusClient && nexusClient.account && nexusClient.account.address)
  // Step 4 https://docs.biconomy.io/tutorials/smart-sessions#install-the-smart-sessions-module
  const installSessionModule = async (nexusClient:any, account:any) => {
    console.log('***installSessionModule1')
    const sessionsModule = toSmartSessionsValidator({ 
      account: nexusClient.account,
      signer: account
    });
    console.log('***installSessionModule2', sessionsModule)
    const hash = await nexusClient.installModule({ 
      module: sessionsModule.moduleInitData
    })
    console.log('***installSessionModule3', hash)
    const { success: installSuccess } = await nexusClient.waitForUserOperationReceipt({ hash });
    console.log('***installSessionModule4', installSuccess)
    const nsc = nexusClient.extend(smartSessionCreateActions(sessionsModule));
    console.log('***installSessionModule5', nexusSessionClient)
    setNexusSessionClient(nsc)
  }

  // Step 5 https://docs.biconomy.io/tutorials/smart-sessions#create-a-smart-session
  const createSmartSession = async (nexusClient:any, nexusSessionClient:any) => {
    console.log('***createSmartSession1', nexusSessionClient)
    const sessionPublicKey = sessionOwner.address;
    console.log('***createSmartSession2', sessionPublicKey)
    const sessionRequestedInfo: CreateSessionDataParams[] = [
        {
            sessionPublicKey,
            actionPoliciesInfo: [{
                contractAddress: CONTRACT_ADDRESS, // Replace with your contract address
                rules: [],
                functionSelector: "0x37994c11" as Hex // Function selector for 'incrementNumber'
            }]
        }
    ];
    console.log('***createSmartSession3', sessionRequestedInfo)
    const _createSessionsResponse = await nexusSessionClient.grantPermission({
        sessionRequestedInfo
    });
    console.log('***createSmartSession4', _createSessionsResponse)
    const { success } = await nexusClient.waitForUserOperationReceipt({ 
        hash: _createSessionsResponse.userOpHash
    });
    console.log('***createSmartSession5', success)
    setCreateSessionsResponse(_createSessionsResponse)
    // Step 6: https://docs.biconomy.io/tutorials/smart-sessions#create-active-session-data
    const sessionData: SessionData = {
      granter: nexusClient.account.address,
      sessionPublicKey,
      moduleData: {
          permissionIds: _createSessionsResponse.permissionIds,
          mode: SmartSessionMode.USE
      }
    };   
    const compressedSessionData = JSON.stringify(sessionData);
    console.log('***createSmartSession6', {compressedSessionData})
    localStorage.setItem(`compressedSessionData:${nexusClient.account.address}`, compressedSessionData)
    console.log('***createSmartSession7')
  }

  const executeSmartSession = async (sessionData:any, functionName:String) => {
    const smartSessionNexusClient = await createNexusSessionClient({
      chain: baseSepolia,
      accountAddress: sessionData.granter,
      signer: sessionOwner,
      transport: http(),
      bundlerTransport: http(bundlerUrl),
      paymaster: createBicoPaymasterClient({paymasterUrl})
    });
    console.log('*** smartSessionNexusClient1', executeSmartSession)

    const usePermissionsModule = toSmartSessionsValidator({
      account: smartSessionNexusClient.account,
      signer: sessionOwner,
      moduleData: sessionData.moduleData
    });
    console.log('*** smartSessionNexusClient2', usePermissionsModule)
    const useSmartSessionNexusClient = smartSessionNexusClient.extend(
      smartSessionUseActions(usePermissionsModule)
    );
    console.log('*** smartSessionNexusClient3', useSmartSessionNexusClient)  
    const userOpHash = await useSmartSessionNexusClient.usePermission({
        calls: [
            {
                to: CONTRACT_ADDRESS, // Replace with your target contract address
                data: encodeFunctionData({
                    abi: [
                      {
                        "inputs":[
                           
                        ],
                        "name":"increament1",
                        "outputs":[
                           
                        ],
                        "stateMutability":"nonpayable",
                        "type":"function"
                     }                  
                    ],
                    functionName: functionName
                })
            }
        ]
    });
    console.log(`Transaction hash: ${userOpHash}`);
  }

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
          <br />
          sca addresses: {nexusClient && nexusClient.account && (nexusClient.account.address)}
          <br />
          session owner: {sessionOwner.address}
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
        <button type="button" onClick={() => {
          installSessionModule(nexusClient, account)
        }}>
          Install Session Module
        </button>
        <button type="button" onClick={() => {
          createSmartSession(nexusClient, nexusSessionClient)
        }}>
          Create Smart Session
        </button>

        <button type="button" onClick={() => {
          executeSmartSession(sessionData, 'increament1')
        }}>
          Execute Smart Session
        </button>
      </div>
    </>
  )
}

export default App
