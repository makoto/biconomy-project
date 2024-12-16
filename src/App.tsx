import { useAccount, useBalance,  useConnect, useDisconnect } from 'wagmi'
import { usePrice } from '@reservoir0x/relay-kit-hooks'

import { extractChain } from 'viem'
import { useWalletClient } from 'wagmi'
import { useEffect, useState } from 'react';
import { 
  privateKeyToAccount, generatePrivateKey
} from "viem/accounts";
import { SmartSessionMode } from "@rhinestone/module-sdk/module"
import {
  createBicoPaymasterClient, createNexusClient, toSmartSessionsValidator, smartSessionCreateActions,
  smartSessionUseActions, CreateSessionDataParams, SessionData,
  createNexusSessionClient
} from "@biconomy/sdk";
import { formatUnits } from 'viem';
import { baseSepolia, optimismSepolia, sepolia } from "viem/chains"; 
import { Hex, encodeFunctionData, parseEther, http } from "viem";
import { getClient, Execute } from "@reservoir0x/relay-sdk";
import { createClient, convertViemChainToRelayChain, TESTNET_RELAY_API } from '@reservoir0x/relay-sdk'

const chainId = 84532
const DEBUG = false

const bundlerUrl = `https://bundler.biconomy.io/api/v3/${chainId}/${import.meta.env.VITE_BUNDLER_PAYMASTER_KEY}`;
const paymasterUrl = `https://paymaster.biconomy.io/api/v2/${chainId}/${import.meta.env.VITE_PAYMASTER_BICONOMY_KEY}`; 
console.log({bundlerUrl, paymasterUrl})
const CONTRACT_ADDRESS = "0x2741DE702f64161780E08601A7c6ab22B9775f5a"
const NAMEHASH = "0x0000000000000000000000000000000000000000000000000000000000000001"
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
  const [sessionOwner, setSessionOwner] =  useState();
  const [sessionIsInstalled, setSessionIsInstalled] =  useState();
  const [quote, setQuote] =  useState();
  const [relayer, setRelayer] =  useState();
  const [bridgeTxhashes, setBridgeTxhashes] =  useState([]);
  const [bridgeCurrentStep, setBridgeCurrentStep] =  useState();
  const [gasslessTo, setGasslessTo] =  useState();
  
  const setClient = async (account:any) => {
    const c = await createNexusClient({
      signer: account,
      chain: baseSepolia,
      transport: http(),
      bundlerTransport: http(bundlerUrl),
      paymaster: createBicoPaymasterClient({paymasterUrl})
    })
    console.log('***1', c.account, account)
    setNexusClient(c)
    const _sessionsModule = toSmartSessionsValidator({ 
      account: c && c.account,
      signer: account.account
    });
    console.log('**233', _sessionsModule)
    const isInstalled = await c.isModuleInstalled({
      module: {
          address: _sessionsModule.moduleInitData.address,
          type: _sessionsModule.moduleInitData.type
      }
    })
    setSessionIsInstalled(isInstalled)
    var so = localStorage.getItem(`sessionOwner`)
    if(!so){
      so = generatePrivateKey()
      localStorage.setItem(`sessionOwner`, so)
    }
    setSessionOwner(privateKeyToAccount(so))
    const compressedSessionData = localStorage.getItem(`compressedSessionData:${c.account.address}`) as SessionData
    const parsedSessionData = JSON.parse(compressedSessionData)
    setSessionData(parsedSessionData)
    console.log(1111,optimismSepolia.id)
    
    const relayerClient = createClient({
      baseApiUrl: TESTNET_RELAY_API,
      source: "YOUR.SOURCE",
      chains: [convertViemChainToRelayChain(optimismSepolia), convertViemChainToRelayChain(baseSepolia)]
    });
    console.log(1112,relayerClient)
    const quoteOption = {
      wallet:account,
      chainId: optimismSepolia.id, // The chain id to bridge from
      toChainId: chainId, // The chain id to bridge to
      tradeType: "EXACT_INPUT",
      amount: '100000000000000000', // Amount in wei to bridge
      currency: "0x0000000000000000000000000000000000000000",
      toCurrency: "0x0000000000000000000000000000000000000000",
      amount: "10000000000000000", // 0.01 ETH
      recipient:c.account.address, // A valid address to send the funds to
    }
    console.log(1113, quoteOption)
    const _quote = await relayerClient.actions.getQuote(quoteOption)
    console.log(1114, {relayerClient, _quote})
    console.log(11141, {setSessionOwner,setQuote, setRelayer})
    setQuote(_quote)
    setRelayer(relayerClient)
    console.log(11144)
  };
  
  useEffect(() => {
    setClient(walletClient)
  }, [walletClient]); // Empty dependency array means it runs only once when the component mounts
  console.log({nexusClient, nexusSessionClient,createSessionsResponse, sessionData})
  console.log(1115, {relayer, quote})

  const bridge = async (quote:any, relayer:any, wallet:any, callbacks:[any]) => {
    console.log('*****bridge1', {quote, relayer, wallet})
    relayer.actions.execute({
      quote,
      wallet,
      onProgress: ({steps, fees, breakdown, currentStep, currentStepItem, txHashes:_bridgeTxHashes, details}) => {
          console.log('***bridge2', {steps, fees, breakdown, currentStep, currentStepItem, _bridgeTxHashes, details})
          setBridgeCurrentStep(currentStep)
          setBridgeTxhashes(_bridgeTxHashes)
          callbacks.map(cb => cb())
      },
    })
  }


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
    const { success: installSuccess, receipt } = await nexusClient.waitForUserOperationReceipt({ hash });
    console.log('***installSessionModule4', installSuccess, receipt)
    setTxHashes(txHashes.concat(receipt.transactionHash))
    const nsc = nexusClient.extend(smartSessionCreateActions(sessionsModule));
    console.log('***installSessionModule5', nexusSessionClient)
    setNexusSessionClient(nsc)
  }

  // Step 5 https://docs.biconomy.io/tutorials/smart-sessions#create-a-smart-session
  const createSmartSession = async (nexusClient:any, nexusSessionClient:any, sessionOwner:any) => {
    console.log('***createSmartSession1', nexusSessionClient)
    const sessionPublicKey = sessionOwner.address;
    console.log('***createSmartSession2', sessionPublicKey)
    const sessionRequestedInfo: CreateSessionDataParams[] = [
        {
            sessionPublicKey,
            actionPoliciesInfo: [
            {
                contractAddress: CONTRACT_ADDRESS, // Replace with your contract address
                rules: [],
                functionSelector: "0xf14fcbc8" as Hex // commit
            },
            {
              contractAddress: CONTRACT_ADDRESS, // Replace with your contract address
              rules: [],
              functionSelector: "0xe1fa8e84" as Hex, // register
              valueLimit: parseEther("1.0") // 1 ETH limit per transaction
            },
            {
              contractAddress: CONTRACT_ADDRESS, // Replace with your contract address
              rules: [],
              functionSelector: "0x8e19899e" as Hex // withdraw
            },
          ]
        }
    ];
    console.log('***createSmartSession3', sessionRequestedInfo)
    const _createSessionsResponse = await nexusSessionClient.grantPermission({
        sessionRequestedInfo
    });
    console.log('***createSmartSession4', _createSessionsResponse)
    const { success, receipt } = await nexusClient.waitForUserOperationReceipt({ 
        hash: _createSessionsResponse.userOpHash
    });
    console.log('***createSmartSession5', success, receipt)
    setTxHashes(txHashes.concat(receipt.transactionHash))
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
    setSessionData(sessionData)
    console.log('***createSmartSession8')
  }

  const executeSmartSession = async (sessionData:any, functionName:String, sessionOwner: any, callbacks:[any]) => {
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
                            {
                               "internalType":"bytes32",
                               "name":"commitment",
                               "type":"bytes32"
                            }
                         ],
                         "name":"commit",
                         "outputs":[
                            
                         ],
                         "stateMutability":"nonpayable",
                         "type":"function"
                      },
                      {
                         "inputs":[
                            {
                               "internalType":"address",
                               "name":"",
                               "type":"address"
                            },
                            {
                               "internalType":"bytes32",
                               "name":"",
                               "type":"bytes32"
                            }
                         ],
                         "name":"commits",
                         "outputs":[
                            {
                               "internalType":"uint256",
                               "name":"",
                               "type":"uint256"
                            }
                         ],
                         "stateMutability":"view",
                         "type":"function"
                      },
                      {
                         "inputs":[
                            {
                               "internalType":"bytes32",
                               "name":"commitment",
                               "type":"bytes32"
                            }
                         ],
                         "name":"register",
                         "outputs":[
                            
                         ],
                         "stateMutability":"payable",
                         "type":"function"
                      },
                      {
                         "inputs":[
                            {
                               "internalType":"address",
                               "name":"",
                               "type":"address"
                            },
                            {
                               "internalType":"bytes32",
                               "name":"",
                               "type":"bytes32"
                            }
                         ],
                         "name":"registers",
                         "outputs":[
                            {
                               "internalType":"uint256",
                               "name":"",
                               "type":"uint256"
                            }
                         ],
                         "stateMutability":"view",
                         "type":"function"
                      },
                      {
                         "inputs":[
                            {
                               "internalType":"bytes32",
                               "name":"commitment",
                               "type":"bytes32"
                            }
                         ],
                         "name":"withdraw",
                         "outputs":[
                            
                         ],
                         "stateMutability":"payable",
                         "type":"function"
                      }
                   ]
                    ,
                    functionName: functionName,
                    args: [NAMEHASH]
                }),
                value: functionName === "register" ? parseEther("0.00001") :  BigInt(0)
            }
        ]
    });
    console.log(`Transaction hash: ${userOpHash}`);
    const receipt = await useSmartSessionNexusClient.waitForUserOperationReceipt({ hash: userOpHash });
    console.log(`receipt: ${userOpHash}`, {receipt});
    setTxHashes(txHashes.concat(receipt.receipt.transactionHash))
    callbacks.map(cb => cb())
  }

  const handleGaslessTransaction = async (to:string, value:number) => {
    console.log({to, value})
    const hash = await nexusClient.sendTransaction({ calls:  
    [
      {
      to, value}] },
    ); 
    console.log("Transaction hash: ", hash) 
    const receipt = await nexusClient.waitForTransactionReceipt({ hash });  
    setTxHashes(txHashes.concat(receipt.transactionHash))
    console.log("Transaction receipt: ", { receipt})
  };
  const scaAddress = nexusClient && nexusClient.account && (nexusClient.account.address)
  const {data:scaBalance, refetch:refetchScaBalance} = useBalance({
    address: scaAddress,
      chainId:chainId
  })
  const {data:eoaBalance, refetch:refetchEoaBalance} = useBalance({
    address: account.address,
  })

  const handleInputChange = (event) => {
    setGasslessTo(event.target.value);
  };

  console.log('**scaBalance', chainId, scaAddress, scaBalance, eoaBalance)
  return (
    <>
      <div>
        <h2>EOA {account && account.chain && `(${account.chain.name})`}</h2>
        <div>
          {DEBUG && (<div>status: {account.status}</div>)}
          
          owner addresses: {JSON.stringify(account.addresses)}(<span style={{ color: 'green', fontWeight: 'bold' }} >{(Number(formatUnits((eoaBalance && eoaBalance.value) || 0, 18))).toFixed(5)} ETH</span>)
          <br />          
        </div>
        <div>
          {account.status !== 'connected' && connectors.map((connector) => {

          return (DEBUG || connector.name === 'Injected')  && (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            type="button"
          >
            Connect {connector.name} wallet
          </button>
          )
          }
          )}

          {account.status === 'connected' && (
          <button type="button" onClick={() => disconnect()}>
            Disconnect
          </button>
          )}
        </div>
        <div>{DEBUG && status}</div>
        <div>{error?.message}</div>
        <div>
        <h2>Cross chain action</h2>
        <button type="button" onClick={() => {
          bridge(quote, relayer, walletClient, [refetchEoaBalance, refetchScaBalance])
        }}>
          Bridge
        </button>
        {bridgeCurrentStep && (bridgeCurrentStep.action)}
        </div>

        <h2>NameChain (Base Sepolia)</h2>
        <div>
          sca addresses: {scaAddress} (<span style={{ color: 'green', fontWeight: 'bold' }}>{(Number(formatUnits((scaBalance && scaBalance.value) || 0, 18)).toFixed(5))}ETH</span>)
          {DEBUG && (
            <span>
              <br />
              session owner: {sessionOwner && sessionOwner.address}
              <br />
              session module: {sessionIsInstalled ? "yes" : "no" }
            </span>
          )}
        </div>

      </div>
      <div>
        {DEBUG && (
          <div>
            <h2>Gasless Transaction</h2>
            <input
              onChange={handleInputChange}
            ></input>
            <button onClick={() => {
              handleGaslessTransaction(gasslessTo, scaBalance.value)
            }}>            
              Send Gasless transaction
            </button>
            <br/>
          </div>
        )}
        <h2>Smart Session (with signature)</h2>
        <button type="button" onClick={() => {
          installSessionModule(nexusClient, account)
        }}>
          Enable smart session
        </button>
        <button type="button" onClick={() => {
          createSmartSession(nexusClient, nexusSessionClient, sessionOwner)
        }}>
          Grant permissions
        </button>
        <br/>
        <h2>Onchain transactions (no signature)</h2>
        <button type="button" onClick={() => {
          executeSmartSession(sessionData, 'commit', sessionOwner)
        }}>
          Commit
        </button>
        <button type="button" onClick={() => {
          executeSmartSession(sessionData, 'register', sessionOwner, [refetchEoaBalance, refetchScaBalance])
        }}>
          Register
        </button>
        <button type="button" onClick={() => {
          executeSmartSession(sessionData, 'withdraw', sessionOwner, [refetchEoaBalance, refetchScaBalance])
        }}>
          Withdraw
        </button>
      </div>
      <div>
      <h2>Txs</h2>
          <ul>
            {
              bridgeTxhashes.map(tx => {
                console.log('**txhashes', tx)
                const explorerUrl = tx.chainId === 84532 ? 'https://sepolia.basescan.org' : 'https://sepolia-optimism.etherscan.io/'
                return (<li>{explorerUrl}/tx/{tx.txHash}</li>)
              })
            }
            {
              txHashes.map(tx => {
                console.log('**txhashes', tx)
                return (<li>https://sepolia.basescan.org/tx/{tx}</li>)
              })
            }
          </ul>
      </div>
    </>
  )
}

export default App
