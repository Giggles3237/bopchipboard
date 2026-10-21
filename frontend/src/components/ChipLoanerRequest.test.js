import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import Chip from './Chip';
import EditSaleForm from './EditSaleForm';
jest.mock('axios');
jest.mock('./ScheduleButton', () => () => <button type="button">Scheduling</button>);
const auth = {token:'test-token',user:{id:7,name:'Alex Advisor',role:'Salesperson',email:'alex@example.com'}};
const sale = {id:42,stockNumber:'P123',clientName:'Casey Buyer',advisor:'Alex Advisor',deliveryDate:'2099-10-14',delivered:false,type:'New BMW',year:2026,make:'BMW',model:'X3'};
function Board({delivered=false}) {
  const [selected,setSelected]=useState(null);
  return <AuthContext.Provider value={{auth}}><Chip sale={{...sale,delivered}} onEdit={setSelected}/>{selected && <EditSaleForm sale={selected} onSubmit={jest.fn()} onCancel={()=>setSelected(null)}/>}</AuthContext.Provider>;
}
beforeEach(()=>{
  jest.clearAllMocks();sessionStorage.clear();
  Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}});
  axios.get.mockResolvedValue({data:[{id:7,name:'Alex Advisor',email:'alex@example.com'}]});
  axios.post.mockResolvedValue({status:200,data:{}});
  jest.spyOn(window,'alert').mockImplementation(()=>{});
  jest.spyOn(console,'log').mockImplementation(()=>{});
});
afterEach(()=>jest.restoreAllMocks());
test.each([false,true])('salesperson chip opens loaner request with sale prefill (delivered=%s)',async delivered=>{
  render(<Board delivered={delivered}/>);fireEvent.click(screen.getByText('P123'));
  await waitFor(()=>expect(axios.get).toHaveBeenCalled());
  expect(screen.queryByRole('button',{name:'Get Ready'})!==null).toBe(!delivered);
  expect(screen.queryByRole('button',{name:'Scheduling'})!==null).toBe(!delivered);
  fireEvent.click(screen.getByRole('button',{name:'Loaner Request'}));
  expect(document.getElementById('loanerStockNumber')).toHaveValue('P123');
  expect(document.getElementById('loanerClientName')).toHaveValue('Casey Buyer');
  expect(document.getElementById('loanerClientAdvisorEmail')).toHaveValue('alex@example.com');
  expect(screen.queryByRole('button',{name:/Approve request/})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Additional Notes:'),{target:{value:'Need replacement during service'}});
  fireEvent.click(screen.getByRole('button',{name:'Submit Loaner Request'}));
  await waitFor(()=>expect(axios.post).toHaveBeenCalledTimes(1));
  const [url,payload,options]=axios.post.mock.calls[0];
  expect(url).toMatch(/\/loaners\/request$/);expect(payload).toMatchObject({stockNumber:'P123',clientName:'Casey Buyer',soldUnit:'Yes',clientAdvisorEmail:'alex@example.com'});
  expect(payload.respondersEmail).toBeUndefined();expect(options.headers.Authorization).toBe('Bearer test-token');
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Submit Loaner Request'})).not.toBeInTheDocument());
});
test('cancel returns to chip modal; closing and reopening preserve the chip and send nothing',async()=>{
  render(<Board/>);fireEvent.click(screen.getByText('P123'));await waitFor(()=>expect(axios.get).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{name:'Loaner Request'}));
  fireEvent.click(screen.getByRole('button',{name:'Cancel Loaner Request'}));
  expect(screen.queryByRole('button',{name:'Submit Loaner Request'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));
  expect(screen.queryByRole('button',{name:'Loaner Request'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('P123'));expect(screen.getByRole('button',{name:'Loaner Request'})).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});
test('empty request notes cannot submit',async()=>{
  render(<Board/>);fireEvent.click(screen.getByText('P123'));await waitFor(()=>expect(axios.get).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{name:'Loaner Request'}));fireEvent.click(screen.getByRole('button',{name:'Submit Loaner Request'}));
  expect(axios.post).not.toHaveBeenCalled();expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('required'));
});
